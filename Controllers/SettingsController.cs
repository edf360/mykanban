using CsvHelper;
using KanbanServer.Constants;
using KanbanServer.Data;
using KanbanServer.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace KanbanServer.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly KanbanDbContext _context;
    private readonly ILogger<SettingsController> _logger;

    public SettingsController(KanbanDbContext context, ILogger<SettingsController> logger)
    {
        _context = context;
        _logger = logger;
    }

    /// <summary>
    /// 設定を取得（単一レコード）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<Setting>> Get()
    {
        var setting = await GetOrCreateSettingAsync();
        return Ok(setting);
    }

    /// <summary>
    /// 設定を全体更新
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] SettingDto? dto)
    {
        if (dto == null)
            return BadRequest(new { error = "Request body is required" });
        var setting = await GetOrCreateSettingAsync();

        // 変更前のユーザー名・ラベル名を取得（名前変更検出用）
        var oldUsers = setting.Users.ToList();
        var oldLabels = setting.Labels.ToList();

        var newUsers = dto.Users ?? new List<string>();
        var newLabels = dto.Labels ?? new List<LabelConfig>();

        // 担当者名変更のマッピングを構築 (旧名 -> 新名)
        var assigneeMap = BuildRenameMap(oldUsers, newUsers);

        // ラベル名変更のマッピングを構築 (旧名 -> 新名)
        var labelMap = BuildRenameMap(
            oldLabels.Select(l => l.Name).ToList(),
            newLabels.Select(l => l.Name).ToList()
        );

        // 既存チケットの担当者名・ラベル名を更新
        if (assigneeMap.Count > 0 || labelMap.Count > 0)
        {
            var tickets = await _context.Tickets.ToListAsync();
            foreach (var ticket in tickets)
            {
                // 担当者名更新
                if (assigneeMap.Count > 0)
                {
                    var newAssignees = ticket.Assignees.Select(a =>
                        assigneeMap.TryGetValue(a, out var newName) ? newName : a
                    ).ToList();
                    if (!ticket.Assignees.SequenceEqual(newAssignees))
                    {
                        ticket.Assignees = newAssignees;
                    }

                    // MainAssignee も更新
                    if (ticket.MainAssignee != null && assigneeMap.TryGetValue(ticket.MainAssignee, out var newMain))
                    {
                        ticket.MainAssignee = newMain;
                    }
                }

                // ラベル名更新
                if (labelMap.Count > 0)
                {
                    var newLabelsForTicket = ticket.Labels.Select(l =>
                        labelMap.TryGetValue(l, out var newName) ? newName : l
                    ).ToList();
                    if (!ticket.Labels.SequenceEqual(newLabelsForTicket))
                    {
                        ticket.Labels = newLabelsForTicket;
                    }
                }
            }
        }

        setting.Users = newUsers;
        setting.Labels = newLabels;
        setting.Holidays = dto.Holidays ?? new List<string>();

        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// 名前変更のマッピングを構築 (旧名 -> 新名)
    /// 削除された項目はマップされない（既存チケットの値はそのまま残る）
    /// </summary>
    private static Dictionary<string, string> BuildRenameMap(List<string> oldList, List<string> newList)
    {
        var map = new Dictionary<string, string>();

        // List.Except() は元のリストの順序を維持する
        var removed = oldList.Except(newList).ToList();
        var added = newList.Except(oldList).ToList();

        int count = Math.Min(removed.Count, added.Count);
        for (int i = 0; i < count; i++)
        {
            map[removed[i]] = added[i];
        }

        return map;
    }

    /// <summary>
    /// データベースをJSONでエクスポート
    /// </summary>
    [HttpPost("export")]
    public async Task<IActionResult> Export()
    {
        var tickets = await _context.Tickets.ToListAsync();
        var histories = await _context.TicketHistories.ToListAsync();
        var settings = await _context.Settings.ToListAsync();

        // TicketのJSONフィールドを直接シリアライズするために特別処理
        var exportData = new
        {
            version = 1,
            exportedAt = DateTime.UtcNow.ToString("o"),
            tickets = tickets.Select(t => new
            {
                t.TicketId,
                t.Id,
                t.Title,
                t.IsArchived,
                t.Column,
                t.Position,
                t.Progress,
                t.StartDate,
                t.EndDate,
                t.Effort,
                assignees = t.Assignees,
                mainAssignee = t.MainAssignee,
                labels = t.Labels,
                t.Memo,
                childTasks = t.ChildTasks,
            }).ToList(),
            histories = histories.Select(h => new
            {
                h.Id,
                h.TicketId,
                h.Type,
                h.Value,
                h.PreviousValue,
                h.Date
            }).ToList(),
            settings = settings.Select(s => new
            {
                s.Id,
                users = s.Users,
                labels = s.Labels,
                holidays = s.Holidays
            }).ToList()
        };

        var json = JsonSerializer.Serialize(exportData, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var filename = $"kanban_backup_{timestamp}.json";

        return File(System.Text.Encoding.UTF8.GetBytes(json), "application/json", filename);
    }

    /// <summary>
    /// JSONからデータベースをインポート（完全上書き）
    /// </summary>
    [HttpPost("import")]
    public async Task<IActionResult> Import(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "ファイルが選択されていません" });

        // ファイルサイズ制限（10MB）
        const long maxFileSize = 10 * 1024 * 1024;
        if (file.Length > maxFileSize)
            return BadRequest(new { error = $"ファイルサイズが制限を超えています（最大10MB）" });

        using var reader = new StreamReader(file.OpenReadStream());
        var json = await reader.ReadToEndAsync();

        try
        {
            var importData = JsonSerializer.Deserialize<ImportData>(json);
            if (importData == null)
                return BadRequest(new { error = "無効なファイル形式です" });

            using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                // 全データを削除してからインポート（完全上書き）
                await _context.Database.ExecuteSqlRawAsync("DELETE FROM TicketHistories");
                await _context.Database.ExecuteSqlRawAsync("DELETE FROM Tickets");
                await _context.Database.ExecuteSqlRawAsync("DELETE FROM Settings");

                // チケットをインポート
                foreach (var t in importData.Tickets ?? new List<ImportTicket>())
                {
                    var ticket = new Ticket
                    {
                        TicketId = t.TicketId,
                        Id = t.Id,
                        Title = t.Title,
                        IsArchived = t.IsArchived,
                        Column = t.Column,
                        Position = t.Position,
                        Progress = t.Progress,
                        StartDate = t.StartDate,
                        EndDate = t.EndDate,
                        Effort = t.Effort,
                        Assignees = t.Assignees ?? new List<string>(),
                        MainAssignee = t.MainAssignee,
                        Labels = t.Labels ?? new List<string>(),
                        Memo = t.Memo ?? string.Empty,
                        ChildTasks = t.ChildTasks?.Select(ct => new ChildTask { Text = ct.Text, Done = ct.Done }).ToList() ?? new List<ChildTask>()
                    };
                    _context.Tickets.Add(ticket);
                }

                // 履歴をインポート（履歴がない場合は自動生成）
                if (importData.Histories != null && importData.Histories.Count > 0)
                {
                    foreach (var h in importData.Histories)
                    {
                        var history = new TicketHistory
                        {
                            TicketId = h.TicketId,
                            Type = h.Type,
                            Value = h.Value,
                            PreviousValue = h.PreviousValue,
                            Date = h.Date
                        };
                        _context.TicketHistories.Add(history);
                    }
                }
                else if (importData.Tickets != null && importData.Tickets.Count > 0)
                {
                    // 履歴がない古いバックアップの場合、各チケットに作成履歴を自動生成
                    foreach (var t in importData.Tickets)
                    {
                        AddHistory(t.TicketId, HistoryTypes.Created, t.Title, null);
                    }
                }

                // 設定をインポート
                foreach (var s in importData.Settings ?? new List<ImportSetting>())
                {
                    var setting = new Setting
                    {
                        Id = s.Id,
                        Users = s.Users ?? new List<string>(),
                        Labels = s.Labels ?? new List<LabelConfig>(),
                        Holidays = s.Holidays ?? new List<string>()
                    };
                    _context.Settings.Add(setting);
                }

                await _context.SaveChangesAsync();
                await tx.CommitAsync();
                return Ok(new { message = "インポートが完了しました" });
            }
            catch
            {
                await tx.RollbackAsync();
                throw;
            }
        }
        catch (JsonException)
        {
            return BadRequest(new { error = "無効なJSON形式です" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "JSONインポートに失敗しました");
            return BadRequest(new { error = "インポートに失敗しました" });
        }
    }

    /// <summary>
    /// CSVからチケットをインポート（既存チケットは更新、新規は追加）
    /// </summary>
    [HttpPost("import-csv")]
    public async Task<IActionResult> ImportCsv(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "ファイルが選択されていません" });

        // ファイルサイズ制限（10MB）
        const long maxFileSize = 10 * 1024 * 1024;
        if (file.Length > maxFileSize)
            return BadRequest(new { error = $"ファイルサイズが制限を超えています（最大10MB）" });

        // CsvHelperでCSVをパース
        try
        {
            using var csvStream = file.OpenReadStream();
            using var csvReader = new StreamReader(csvStream, System.Text.Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
            using var csv = new CsvReader(csvReader, CultureInfo.InvariantCulture);
            csv.Read();
            csv.ReadHeader();
            
            if (csv.HeaderRecord == null)
                return BadRequest(new { error = "CSVヘッダーが見つかりません" });

        // ヘッダー行からカラムインデックスを構築
        var columnIndexes = new Dictionary<string, int>();
        for (int i = 0; i < csv.HeaderRecord.Length; i++)
        {
            columnIndexes[csv.HeaderRecord[i].Trim()] = i;
        }

        // 必須列の確認
        var requiredColumns = new[] { "タスクID", "タスク名" };
        foreach (var col in requiredColumns)
        {
            if (!columnIndexes.ContainsKey(col))
                return BadRequest(new { error = $"必須列「{col}」が見つかりません" });
        }

        var imported = 0;
        var skipped = 0;

        // CSVから発見した担当者とラベルを収集
        var discoveredAssignees = new HashSet<string>();
        var discoveredLabels = new HashSet<string>();

        // 既存チケットを事前ロード（N+1問題回避）
        var existingTicketsDict = await _context.Tickets.ToDictionaryAsync(t => t.TicketId);

        // カラム別最大Positionを事前計算（ループ中のDBアクセスを回避）
        // TicketService.CreateAsync と同じロジックで -1000 をベースにする
        var maxPositionByColumn = await _context.Tickets
            .GroupBy(t => t.Column)
            .ToDictionaryAsync(g => g.Key, g => g.Max(t => (double?)t.Position) ?? -1000);

        // 次Idを事前計算（自動採番されないスキーマでも登録可能に）
        var nextTicketInternalId = (await _context.Tickets.MaxAsync(t => (int?)t.Id) ?? 0) + 1;

        while (csv.Read())
        {
            // 空行をスキップ
            var ticketIdRaw = csv.GetField(columnIndexes["タスクID"]);
            if (string.IsNullOrWhiteSpace(ticketIdRaw))
                continue;

            var ticketId = ticketIdRaw.Trim();
            var title = csv.GetField(columnIndexes["タスク名"])?.Trim() ?? "";
            
            if (string.IsNullOrEmpty(title))
            {
                skipped++;
                continue;
            }

            // 既存チケットをDictionaryから検索（インポート中に追加/更新したチケットも含まれる）
            existingTicketsDict.TryGetValue(ticketId, out var existingTicket);
            var originalColumn = existingTicket?.Column;

            var ticket = existingTicket ?? new Ticket { TicketId = ticketId };
            
            ticket.Title = title;
            // CSVインポート時はタイトルを集計カテゴリに設定
            ticket.Category = title;
            // バケット進捗は一時的に保持（子タスクから計算があれば上書き）
            var bucketProgress = ParseProgress(csv.GetField(columnIndexes["バケット"]) ?? "");
            ticket.Progress = bucketProgress;
            ticket.Column = MapStateToColumn(csv.GetField(columnIndexes["状態"]) ?? "");
            ticket.IsArchived = false;
            
            // 担当者の処理（;区切りで複数対応）
            var assigneesStr = csv.GetField(columnIndexes["担当者"]) ?? "";
            var assignees = ParseSemicolonSeparated(assigneesStr);
            ticket.Assignees = assignees;
            foreach (var a in assignees)
            {
                discoveredAssignees.Add(a);
            }
            if (existingTicket == null)
            {
                ticket.MainAssignee = assignees.Count > 0 ? assignees[0] : null;
            }

            // 日付の処理
            ticket.StartDate = ParseDate(csv.GetField(columnIndexes["開始日"]) ?? "");
            ticket.EndDate = ParseDate(csv.GetField(columnIndexes["期限"]) ?? "");

            // チェックリストの処理（子タスクのCategoryにタイトルを設定）
            var checklistItems = csv.GetField(columnIndexes["チェックリスト項目"]) ?? "";
            ticket.ChildTasks = ParseChecklist(checklistItems);
            // 各子タスクのCategoryにテキストを設定
            foreach (var ct in ticket.ChildTasks)
            {
                ct.Category = ct.Text;
            }

            // 子タスクに【X%】指定があればバケットを無視して子タスクから進捗率を計算
            if (HasProgressAnnotation(checklistItems))
            {
                var totalProgress = ticket.ChildTasks.Sum(ct => ct.Progress);
                ticket.Progress = (int)(totalProgress / ticket.ChildTasks.Count);
            }

            // ラベルの処理
            var labelsStr = csv.GetField(columnIndexes["ラベル"]) ?? "";
            var labels = ParseSemicolonSeparated(labelsStr);
            ticket.Labels = labels;
            foreach (var label in labels)
            {
                discoveredLabels.Add(label);
            }

            // メモの処理
            ticket.Memo = csv.GetField(columnIndexes["メモ"]) ?? "";

            if (existingTicket == null)
            {
                // 新規チケットのId設定（自動採番されないスキーマでも登録可能に）
                ticket.Id = nextTicketInternalId;
                nextTicketInternalId++;

                // 新規チケットのPosition設定（事前計算値を使用）
                if (!maxPositionByColumn.TryGetValue(ticket.Column, out var maxPos))
                    maxPos = -1000;
                ticket.Position = maxPos + 1000.0;
                maxPositionByColumn[ticket.Column] = ticket.Position;
                _context.Tickets.Add(ticket);

                // Dictionaryに追加して同一IDの重複インポートを防ぐ
                existingTicketsDict[ticket.TicketId] = ticket;

                // 作成履歴を記録
                AddHistory(ticket.TicketId, HistoryTypes.Created, ticket.Title, null);
            }
            else
            {
                if (!string.Equals(originalColumn, ticket.Column, StringComparison.Ordinal))
                {
                    if (!maxPositionByColumn.TryGetValue(ticket.Column, out var maxPos))
                    {
                        maxPos = -1000;
                    }
                    ticket.Position = maxPos + 1000.0;
                    maxPositionByColumn[ticket.Column] = ticket.Position;
                }
                // 既存チケット更新 - 変更フィールドを比較して履歴記録
                if (existingTicket.Title != ticket.Title)
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Title, ticket.Title, existingTicket.Title);
                }
                if (existingTicket.AssigneesJson != ticket.AssigneesJson)
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Assignee, ticket.AssigneesJson, existingTicket.AssigneesJson);
                }
                if (existingTicket.LabelsJson != ticket.LabelsJson)
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Label, ticket.LabelsJson, existingTicket.LabelsJson);
                }
                if (existingTicket.Column != ticket.Column)
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Status, ticket.Column, existingTicket.Column);
                }
                if (!Equals(existingTicket.StartDate, ticket.StartDate))
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Date,
                        ticket.StartDate?.ToString("yyyy-MM-dd") ?? "",
                        existingTicket.StartDate?.ToString("yyyy-MM-dd") ?? "");
                }
                if (!Equals(existingTicket.Effort, ticket.Effort))
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Effort,
                        ticket.Effort?.ToString() ?? "",
                        existingTicket.Effort?.ToString() ?? "");
                }
                if (existingTicket.Memo != ticket.Memo)
                {
                    AddHistory(ticket.TicketId, HistoryTypes.Memo, ticket.Memo, existingTicket.Memo);
                }
                if (existingTicket.ChildTasksJson != ticket.ChildTasksJson)
                {
                    AddHistory(ticket.TicketId, HistoryTypes.ChildTask, ticket.ChildTasksJson, existingTicket.ChildTasksJson);
                }
            }

            imported++;
        }

            // 発見した担当者とラベルを設定に追加
            await MergeDiscoveredSettingsAsync(discoveredAssignees, discoveredLabels);

            // 各カラムのPositionを再配置（重複を解消）
            RepositionAllColumns();

            await _context.SaveChangesAsync();
            return Ok(new { message = "インポートが完了しました", count = imported, skipped = skipped });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "CSVインポートに失敗しました");
            return BadRequest(new { error = "インポートに失敗しました" });
        }
    }

    private static string MapStateToColumn(string state)
    {
        return state.Trim() switch
        {
            "開始前" => "todo",
            "処理中" => "doing",
            "完了済み" => "done",
            _ => "todo"
        };
    }

    private static int ParseProgress(string value)
    {
        var cleaned = value.Trim().Replace("%", "");
        return int.TryParse(cleaned, out var result) ? Math.Clamp(result, 0, 100) : 0;
    }

    private static DateTime? ParseDate(string value)
    {
        var cleaned = value.Trim();
        if (string.IsNullOrEmpty(cleaned))
            return null;
        // カルチャ不変のパーサーを使用し、複数のフォーマットをサポート
        var formats = new[] { "yyyy-MM-dd", "yyyy/MM/dd", "yyyy-MM-ddTHH:mm:ss", "yyyy-MM-dd HH:mm:ss", "o" };
        if (DateTime.TryParseExact(cleaned, formats, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            return date;
        // Fallback: InvariantCulture で標準パース
        if (DateTime.TryParse(cleaned, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date2))
            return date2;
        return null;
    }

    private static List<ChildTask> ParseChecklist(string itemsStr)
    {
        var result = new List<ChildTask>();
        if (string.IsNullOrWhiteSpace(itemsStr))
            return result;

        var items = itemsStr.Split(';')
            .Select(s => s.Trim())
            .Where(s => !string.IsNullOrEmpty(s))
            .ToList();

        foreach (var item in items)
        {
            var ct = new ChildTask { Text = item, Done = false };
            // 【X%】表記から進捗率をパース（0%〜100%）
            if (TryExtractProgress(item, out var progress))
            {
                ct.Progress = progress;
                // タイトルから【X%】表記を除去
                ct.Text = System.Text.RegularExpressions.Regex.Replace(item, @"【[0-9０-９]+[%％]】", "").TrimStart();
                // 100%なら完了済み
                ct.Done = progress >= 100;
            }
            result.Add(ct);
        }

        return result;
    }

    /// <summary>
    /// テキストから【X%】形式の進捗率を抽出（0-100）
    /// </summary>
    private static bool TryExtractProgress(string text, out int progress)
    {
        var match = System.Text.RegularExpressions.Regex.Match(text, @"【([0-9０-９]+)[%％]】");
        if (match.Success && int.TryParse(match.Groups[1].Value, out var p))
        {
            progress = Math.Clamp(p, 0, 100);
            return true;
        }
        progress = 0;
        return false;
    }

    /// <summary>
    /// チェックリスト項目に【X%】の進捗指定が含まれているか確認
    /// </summary>
    private static bool HasProgressAnnotation(string itemsStr)
    {
        if (string.IsNullOrWhiteSpace(itemsStr))
            return false;
        return System.Text.RegularExpressions.Regex.IsMatch(itemsStr, @"【[0-9０-９]+[%％]】");
    }

    private static List<string> ParseSemicolonSeparated(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return new List<string>();
        return value.Split(';')
            .Select(s => s.Trim())
            .Where(s => !string.IsNullOrEmpty(s))
            .ToList();
    }

    /// <summary>
    /// 履歴を追加
    /// </summary>
    private void AddHistory(string ticketId, string type, string? value, string? previousValue)
    {
        _context.TicketHistories.Add(new TicketHistory
        {
            TicketId = ticketId,
            Type = type,
            Value = value,
            PreviousValue = previousValue,
            Date = DateTime.UtcNow
        });
    }

    /// <summary>
    /// 各カラムのPositionを再配置（重複を解消）
    /// </summary>
    private void RepositionAllColumns()
    {
        // Localビューを使用し、DBに保存されていない新規チケットも含める
        // アーカイブチケットは除外（Position=0に固定）
        var localTickets = _context.Tickets.Local
            .Where(t => !t.IsArchived)
            .ToList();
        var columns = localTickets.Select(t => t.Column).Distinct().ToList();
        foreach (var column in columns)
        {
            // Position降順でソート（大きい値が先頭＝上部に表示）
            var tickets = localTickets
                .Where(t => t.Column == column)
                .OrderByDescending(t => t.Position)
                .ThenBy(t => t.Id)
                .ToList();

            // 先頭から大きな値を割り当て（降順で配置）
            for (int i = 0; i < tickets.Count; i++)
            {
                tickets[i].Position = (tickets.Count - i) * 1000.0;
            }
        }
    }

    /// <summary>
    /// 設定を取得または作成
    /// </summary>
    private async Task<Setting> GetOrCreateSettingAsync()
    {
        var setting = await _context.Settings.FirstOrDefaultAsync();
        if (setting != null)
            return setting;

        setting = new Setting { Id = 1 };
        _context.Settings.Add(setting);
        await _context.SaveChangesAsync();
        return setting;
    }

    /// <summary>
    /// CSVから発見した担当者とラベルを設定にマージ（重複追加なし）
    /// Setting.Users / Setting.Labels は getter ごとに新しいインスタンスを返すため、
    /// 取得→追加→再代入の pattern で JSON に保存する。
    /// </summary>
    private async Task MergeDiscoveredSettingsAsync(HashSet<string> assignees, HashSet<string> labels)
    {
        if (assignees.Count == 0 && labels.Count == 0)
            return;

        var setting = await GetOrCreateSettingAsync();

        // 既存リストを取得（getter は毎回新しいインスタンスを返す）
        var users = setting.Users;
        var labelConfigs = setting.Labels;

        // 担当者を追加（既存重複なし）
        if (assignees.Count > 0)
        {
            var existingUsers = new HashSet<string>(users);
            foreach (var a in assignees)
            {
                if (!existingUsers.Contains(a))
                {
                    users.Add(a);
                    existingUsers.Add(a);
                }
            }
        }

        // ラベルを追加（既存重複なし、新規はデフォルトグレー）
        if (labels.Count > 0)
        {
            var existingLabelNames = new HashSet<string>(labelConfigs.Select(l => l.Name));
            foreach (var l in labels)
            {
                if (!existingLabelNames.Contains(l))
                {
                    labelConfigs.Add(new LabelConfig { Name = l, Color = "#808080" });
                    existingLabelNames.Add(l);
                }
            }
        }

        // setter に再代入して JSON に保存
        setting.Users = users;
        setting.Labels = labelConfigs;
    }
}

/// <summary>
/// 設定更新用DTO
/// </summary>
public class SettingDto
{
    public List<string>? Users { get; set; }
    public List<LabelConfig>? Labels { get; set; }
    public List<string>? Holidays { get; set; }
}

/// <summary>
/// インポート用データ構造
/// </summary>
public class ImportData
{
    public int Version { get; set; }
    public string? ExportedAt { get; set; }
    public List<ImportTicket>? Tickets { get; set; }
    public List<ImportHistory>? Histories { get; set; }
    public List<ImportSetting>? Settings { get; set; }
}

public class ImportTicket
{
    public string TicketId { get; set; } = "";
    public int Id { get; set; }
    public string Title { get; set; } = "";
    public bool IsArchived { get; set; }
    public string Column { get; set; } = "";
    public int Position { get; set; }
    public int Progress { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? Effort { get; set; }
    public List<string>? Assignees { get; set; }
    public string? MainAssignee { get; set; }
    public List<string>? Labels { get; set; }
    public string? Memo { get; set; }
    public List<ImportChildTask>? ChildTasks { get; set; }
}

public class ImportChildTask
{
    public string Text { get; set; } = "";
    public bool Done { get; set; }
}

public class ImportHistory
{
    public int Id { get; set; }
    public string TicketId { get; set; } = "";
    public string Type { get; set; } = "";
    public string? Value { get; set; }
    public string? PreviousValue { get; set; }
    public DateTime Date { get; set; }
}

public class ImportSetting
{
    public int Id { get; set; }
    public List<string>? Users { get; set; }
    public List<LabelConfig>? Labels { get; set; }
    public List<string>? Holidays { get; set; }
}

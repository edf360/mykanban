using CsvHelper;
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

        // 既存チケットの担当者名・ラベル名を更新（中間テーブル経由）
        if (assigneeMap.Count > 0 || labelMap.Count > 0)
        {
            // 担当者名更新 - TicketAssignees テーブルのUPDATE
            if (assigneeMap.Count > 0)
            {
                var oldAssigneeKeys = assigneeMap.Keys.ToList();
                foreach (var (oldName, newName) in assigneeMap)
                {
                    await _context.TicketAssignees
                        .Where(a => a.Assignee == oldName)
                        .ExecuteUpdateAsync(a => a.SetProperty(x => x.Assignee, newName));
                }
            }

            // ラベル名更新 - TicketLabels テーブルのUPDATE
            if (labelMap.Count > 0)
            {
                foreach (var (oldLabel, newLabel) in labelMap)
                {
                    await _context.TicketLabels
                        .Where(l => l.Label == oldLabel)
                        .ExecuteUpdateAsync(l => l.SetProperty(x => x.Label, newLabel));
                }
            }
        }

        setting.Users = newUsers;
        setting.Labels = newLabels;
        setting.Holidays = dto.Holidays ?? new List<string>();
        setting.Memos = dto.Memos ?? new Dictionary<string, string>();

        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// 担当者のメモのみを更新（PATCH）
    /// Read-Modify-Write競合を排除するため、他の設定データに触れない
    /// </summary>
    [HttpPatch("memo")]
    public async Task<IActionResult> UpdateMemo([FromBody] MemoUpdateDto? dto)
    {
        if (dto == null || string.IsNullOrEmpty(dto.Assignee))
            return BadRequest(new { error = "Assignee is required" });

        var setting = await GetOrCreateSettingAsync();
        // 【BUG-13修正】Memos getter は毎回新しいDictionaryを返すため、setterで再代入してMemosJsonを更新する
        var currentMemos = setting.Memos;
        currentMemos[dto.Assignee] = dto.Memo ?? string.Empty;
        setting.Memos = currentMemos;
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
    /// 有効なカラム名のリスト
    /// </summary>
    private static readonly HashSet<string> ValidColumns = new(StringComparer.OrdinalIgnoreCase)
    {
        "todo", "doing", "done", "archive"
    };

    /// <summary>
    /// データベースをJSONまたはCSVでエクスポート
    /// </summary>
    [HttpPost("export")]
    public async Task<IActionResult> Export([FromQuery] string format = "json")
    {
        var tickets = await _context.Tickets.ToListAsync();
        var settings = await _context.Settings.ToListAsync();

        // 子タスクをチケットごとにグループ化
        var allChildTasks = await _context.ChildTasks.ToListAsync();

        // 【BUG-20修正】CSV形式のエクスポートをサポート
        if (string.Equals(format, "csv", StringComparison.OrdinalIgnoreCase))
        {
            return await ExportCsv(tickets, allChildTasks);
        }

        // TicketのJSONフィールドを直接シリアライズするために特別処理
        var exportTickets = tickets.Select(t => new
        {
            t.TicketId,
            t.Title,
            t.IsArchived,
            t.Column,
            t.Position,
            t.StartDate,
            t.EndDate,
            t.Effort,
            assignees = t.Assignees,
            labels = t.Labels,
            t.Memo,
            childTasks = allChildTasks.Where(ct => ct.TicketId == t.TicketId).Select(ct => new { ct.Text, ct.Done }).ToList(),
        }).ToList();

        var exportData = new
        {
            version = 1,
            exportedAt = DateTime.UtcNow.ToString("o"),
            tickets = exportTickets,
            settings = settings.Select(s => new
            {
                s.Id,
                users = s.Users,
                labels = s.Labels,
                holidays = s.Holidays,
                memos = s.Memos
            }).ToList()
        };

        var json = JsonSerializer.Serialize(exportData, new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping });
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var filename = $"kanban_backup_{timestamp}.json";

        return File(System.Text.Encoding.UTF8.GetBytes(json), "application/json", filename);
    }

    /// <summary>
    /// CSV形式でエクスポート（BUG-20修正追加）
    /// </summary>
    private async Task<IActionResult> ExportCsv(List<Ticket> tickets, List<ChildTask> allChildTasks)
    {
        using var memoryStream = new MemoryStream();
        using var writer = new StreamWriter(memoryStream, System.Text.Encoding.UTF8);
        using var csv = new CsvHelper.CsvWriter(writer, CultureInfo.InvariantCulture);

        // ヘッダーを書き出し（BOM付きUTF-8でExcel互換）
        csv.WriteField("タスクID");
        csv.WriteField("タスク名");
        csv.WriteField("状態");
        csv.WriteField("担当者");
        csv.WriteField("開始日");
        csv.WriteField("期限");
        csv.WriteField("ラベル");
        csv.WriteField("メモ");
        csv.WriteField("チェックリスト項目");
        csv.NextRecord();

        foreach (var ticket in tickets)
        {
            csv.WriteField(ticket.TicketId);
            csv.WriteField(ticket.Title);
            csv.WriteField(MapColumnToState(ticket.Column));
            csv.WriteField(string.Join(";", ticket.Assignees));
            csv.WriteField(ticket.StartDate?.ToString("yyyy-MM-dd") ?? "");
            csv.WriteField(ticket.EndDate?.ToString("yyyy-MM-dd") ?? "");
            csv.WriteField(string.Join(";", ticket.Labels));
            csv.WriteField(ticket.Memo ?? "");

            // チェックリスト項目を;区切りで出力
            var childTasks = allChildTasks
                .Where(ct => ct.TicketId == ticket.TicketId)
                .OrderBy(ct => ct.OrderIndex)
                .Select(ct => ct.Done ? $"[完了]{ct.Text}" : ct.Text)
                .ToList();
            csv.WriteField(string.Join(";", childTasks));
            csv.NextRecord();
        }

        await writer.FlushAsync();
        var timestamp = DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var filename = $"kanban_export_{timestamp}.csv";
        // BOM付きUTF-8バイト配列を生成
        var bytes = System.Text.Encoding.UTF8.GetPreamble().Concat(memoryStream.ToArray()).ToArray();
        return File(bytes, "text/csv;charset=utf-8", filename);
    }

    /// <summary>
    /// カラム名をCSV用の状態名に変換
    /// </summary>
    private static string MapColumnToState(string column)
    {
        return column.Trim().ToLowerInvariant() switch
        {
            "todo" => "開始前",
            "doing" => "処理中",
            "done" => "完了済み",
            "archive" => "アーカイブ",
            _ => column
        };
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

            // 【BUG-06修正】インポート前にColumn値を検証し、存在しないカラムの場合にエラーを返す
            var invalidColumns = (importData.Tickets ?? new List<ImportTicket>())
                .Select(t => t.Column)
                .Where(c => !string.IsNullOrEmpty(c) && !ValidColumns.Contains(c))
                .Distinct()
                .ToList();
            if (invalidColumns.Count > 0)
            {
                return BadRequest(new { error = $"存在しないカラムが指定されています: {string.Join(", ", invalidColumns)}" });
            }

            using var tx = await _context.Database.BeginTransactionAsync();
            try
            {
                // 全データを削除してからインポート（完全上書き）
                await _context.Database.ExecuteSqlRawAsync("DELETE FROM Tickets");
                await _context.Database.ExecuteSqlRawAsync("DELETE FROM Settings");

                // チケットをインポート
                foreach (var t in importData.Tickets ?? new List<ImportTicket>())
                {
                    var ticket = new Ticket
                    {
                        TicketId = t.TicketId,
                        Title = t.Title,
                        IsArchived = t.IsArchived,
                        Column = t.Column,
                        Position = t.Position,
                        StartDate = t.StartDate,
                        EndDate = t.EndDate,
                        Effort = t.Effort,
                        Assignees = t.Assignees ?? new List<string>(),
                        Labels = t.Labels ?? new List<string>(),
                        Memo = t.Memo ?? string.Empty,
                    };
                    _context.Tickets.Add(ticket);

                    // 【BUG-05修正】子タスクもインポートする
                    if (t.ChildTasks != null && t.ChildTasks.Count > 0)
                    {
                        for (int i = 0; i < t.ChildTasks.Count; i++)
                        {
                            var ct = t.ChildTasks[i];
                            _context.ChildTasks.Add(new ChildTask
                            {
                                Id = Guid.NewGuid().ToString("N"),
                                TicketId = ticket.TicketId,
                                Text = ct.Text,
                                Done = ct.Done,
                                OrderIndex = i,
                                CreatedAt = DateTime.Now
                            });
                        }
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
                        Holidays = s.Holidays ?? new List<string>(),
                        Memos = s.Memos ?? new Dictionary<string, string>()
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
            // 【BUG-01修正】CSVインポート処理をトランザクションで囲み、データ整合性を保証する
            using var tx = await _context.Database.BeginTransactionAsync();

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
                // CSVインポート時はタイトルを集計IDに設定
                ticket.Category = title;
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

                // 日付の処理
                ticket.StartDate = ParseDate(csv.GetField(columnIndexes["開始日"]) ?? "");
                ticket.EndDate = ParseDate(csv.GetField(columnIndexes["期限"]) ?? "");

                // チェックリストの処理（独立テーブルへ登録）
                var checklistItems = csv.GetField(columnIndexes["チェックリスト項目"]) ?? "";
                var childTaskList = ParseChecklist(checklistItems);
                // 各子タスクのCategoryにテキストを設定
                foreach (var ct in childTaskList)
                {
                    ct.Category = ct.Text;
                }
                // 既存チケットの場合は既存子タスクを削除してから新しい子タスクを追加
                if (existingTicket != null)
                {
                    var existingChildTasks = _context.ChildTasks.Where(ct => ct.TicketId == ticketId).ToList();
                    _context.ChildTasks.RemoveRange(existingChildTasks);
                }
                // 子タスクを独立テーブルへ追加
                foreach (var ct in childTaskList)
                {
                    ct.TicketId = ticket.TicketId;
                    _context.ChildTasks.Add(ct);
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
                    // 新規チケットのPosition設定（事前計算値を使用）
                    if (!maxPositionByColumn.TryGetValue(ticket.Column, out var maxPos))
                        maxPos = -1000;
                    ticket.Position = maxPos + 1000.0;
                    maxPositionByColumn[ticket.Column] = ticket.Position;
                    _context.Tickets.Add(ticket);

                    // Dictionaryに追加して同一IDの重複インポートを防ぐ
                    existingTicketsDict[ticket.TicketId] = ticket;
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
                }

                imported++;
            }

            // 発見した担当者とラベルを設定に追加
            await MergeDiscoveredSettingsAsync(discoveredAssignees, discoveredLabels);

            // 各カラムのPositionを再配置（重複を解消）
            RepositionAllColumns();

            await _context.SaveChangesAsync();
            
            // 【BUG-01修正】トランザクションをコミット
            await tx.CommitAsync();
            
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
    /// 派手でないランダムな色をHSL色彩空間で生成（彩度30-60%, 明度40-70%）
    /// </summary>
    private static string GenerateSoftRandomColor()
    {
        // Random.Shared は .NET 6+ でスレッドセーフな共有インスタンス
        double hue = Random.Shared.NextDouble() * 360;               // 0-360°
        double saturation = 30.0 + Random.Shared.NextDouble() * 30.0;  // 30-60%
        double lightness = 40.0 + Random.Shared.NextDouble() * 30.0;   // 40-70%
        return HslToHex(hue, saturation, lightness);
    }

    /// <summary>
    /// HSLをHEX色コードに変換
    /// </summary>
    private static string HslToHex(double h, double s, double l)
    {
        s /= 100.0;
        l /= 100.0;
        
        double c = (1.0 - Math.Abs(2.0 * l - 1.0)) * s;  // 色差
        double x = c * (1.0 - Math.Abs((h / 60.0) % 2.0 - 1.0));
        double m = l - c / 2.0;
        
        double r, g, b;
        
        if (h < 60) { r = c; g = x; b = 0; }
        else if (h < 120) { r = x; g = c; b = 0; }
        else if (h < 180) { r = 0; g = c; b = x; }
        else if (h < 240) { r = 0; g = x; b = c; }
        else if (h < 300) { r = x; g = 0; b = c; }
        else { r = c; g = 0; b = x; }
        
        int ri = (int)Math.Round((r + m) * 255);
        int gi = (int)Math.Round((g + m) * 255);
        int bi = (int)Math.Round((b + m) * 255);
        
        ri = Math.Clamp(ri, 0, 255);
        gi = Math.Clamp(gi, 0, 255);
        bi = Math.Clamp(bi, 0, 255);
        
        return $"#{ri:X2}{gi:X2}{bi:X2}";
    }

    /// <summary>
    /// 各カラムのPositionを再配置（重複を解消）
    /// 【BUG-18修正】_context.Tickets.Local の代わりに Entries から追跡中のTicketを取得。
    /// Localビューは大量データ時やコンテキストクリア時に問題が発生する可能性があるため、
    /// ChangeTracker.Entries() を使用してより堅牢な実装にする。
    /// </summary>
    private void RepositionAllColumns()
    {
        // EF CoreのChangeTrackerから追跡中の全Ticketエンティティを取得
        // （DB既存分 + 新規追加/更新分の両方を含む）
        var trackedTickets = _context.ChangeTracker
            .Entries<Ticket>()
            .Select(e => e.Entity)
            .Where(t => !t.IsArchived)
            .ToList();

        var columns = trackedTickets.Select(t => t.Column).Distinct().ToList();
        foreach (var column in columns)
        {
            // Position降順でソート（大きい値が先頭＝上部に表示）
            var tickets = trackedTickets
                .Where(t => t.Column == column)
                .OrderByDescending(t => t.Position)
                .ThenBy(t => t.CreatedAt)
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

        // ラベルを追加（既存重複なし、新規はランダムな柔らかい色）
        if (labels.Count > 0)
        {
            var existingLabelNames = new HashSet<string>(labelConfigs.Select(l => l.Name));
            foreach (var l in labels)
            {
                if (!existingLabelNames.Contains(l))
                {
                    labelConfigs.Add(new LabelConfig { Name = l, Color = GenerateSoftRandomColor() });
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
    public Dictionary<string, string>? Memos { get; set; }
}

/// <summary>
/// インポート用データ構造
/// </summary>
public class ImportData
{
    public int Version { get; set; }
    public string? ExportedAt { get; set; }
    public List<ImportTicket>? Tickets { get; set; }
    public List<ImportSetting>? Settings { get; set; }
}

public class ImportTicket
{
    public string TicketId { get; set; } = "";
    public string Title { get; set; } = "";
    public bool IsArchived { get; set; }
    public string Column { get; set; } = "";
    public int Position { get; set; }
    public int Progress { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? Effort { get; set; }
    public List<string>? Assignees { get; set; }
    public List<string>? Labels { get; set; }
    public string? Memo { get; set; }
    public List<ImportChildTask>? ChildTasks { get; set; }
}

public class ImportChildTask
{
    public string Text { get; set; } = "";
    public bool Done { get; set; }
}

public class ImportSetting
{
    public int Id { get; set; }
    public List<string>? Users { get; set; }
    public List<LabelConfig>? Labels { get; set; }
    public List<string>? Holidays { get; set; }
    public Dictionary<string, string>? Memos { get; set; }
}

/// <summary>
/// メモ更新用DTO (PATCH /api/settings/memo 用)
/// </summary>
public class MemoUpdateDto
{
    public string Assignee { get; set; } = string.Empty;
    public string? Memo { get; set; }
}

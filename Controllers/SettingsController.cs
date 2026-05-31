using KanbanServer.Data;
using KanbanServer.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Text;
using System.Text.Json;

namespace KanbanServer.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly KanbanDbContext _context;

    public SettingsController(KanbanDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// 設定を取得（単一レコード）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<Setting>> Get()
    {
        var setting = await _context.Settings.FirstOrDefaultAsync();
        if (setting == null)
        {
            // 初回アクセス時はデフォルト設定を作成
            setting = new Setting { Id = 1 };
            _context.Settings.Add(setting);
            await _context.SaveChangesAsync();
        }
        return Ok(setting);
    }

    /// <summary>
    /// 設定を全体更新
    /// </summary>
    [HttpPut]
    public async Task<IActionResult> Update([FromBody] SettingDto dto)
    {
        var setting = await _context.Settings.FirstOrDefaultAsync();
        if (setting == null)
        {
            setting = new Setting { Id = 1 };
            _context.Settings.Add(setting);
        }

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

        // 旧リストと新リストをインデックスで比較して変更を検出
        int maxLen = Math.Max(oldList.Count, newList.Count);
        for (int i = 0; i < maxLen; i++)
        {
            if (i < oldList.Count && i < newList.Count && oldList[i] != newList[i])
            {
                map[oldList[i]] = newList[i];
            }
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

        var json = JsonSerializer.Serialize(exportData, new JsonSerializerOptions { WriteIndented = true });
        var timestamp = DateTime.Now.ToString("yyyyMMddHHmmss");
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

        using var reader = new StreamReader(file.OpenReadStream());
        var json = await reader.ReadToEndAsync();

        try
        {
            var importData = JsonSerializer.Deserialize<ImportData>(json);
            if (importData == null)
                return BadRequest(new { error = "無効なファイル形式です" });

            // 全データを削除してからインポート（完全上書き）
            _context.TicketHistories.RemoveRange(_context.TicketHistories);
            _context.Tickets.RemoveRange(_context.Tickets);
            _context.Settings.RemoveRange(_context.Settings);
            await _context.SaveChangesAsync();

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
                    Labels = t.Labels ?? new List<string>(),
                    Memo = t.Memo ?? string.Empty,
                    ChildTasks = t.ChildTasks?.Select(ct => new ChildTask { Text = ct.Text, Done = ct.Done }).ToList() ?? new List<ChildTask>()
                };
                _context.Tickets.Add(ticket);
            }

            // 履歴をインポート
            foreach (var h in importData.Histories ?? new List<ImportHistory>())
            {
                var history = new TicketHistory
                {
                    Id = h.Id,
                    TicketId = h.TicketId,
                    Type = h.Type,
                    Value = h.Value,
                    PreviousValue = h.PreviousValue,
                    Date = h.Date
                };
                _context.TicketHistories.Add(history);
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
            return Ok(new { message = "インポートが完了しました" });
        }
        catch (JsonException ex)
        {
            return BadRequest(new { error = $"JSONパースエラー: {ex.Message}" });
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"インポートエラー: {ex.Message}" });
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

        using var reader = new StreamReader(file.OpenReadStream());
        var lines = new List<string>();
        string? line;
        while ((line = await reader.ReadLineAsync()) != null)
        {
            lines.Add(line);
        }

        if (lines.Count < 2)
            return BadRequest(new { error = "CSVデータが空です" });

        // ヘッダー行をパース
        var headers = ParseCsvLine(lines[0]);
        var columnIndexes = new Dictionary<string, int>();
        for (int i = 0; i < headers.Length; i++)
        {
            columnIndexes[headers[i].Trim()] = i;
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

        for (int row = 1; row < lines.Count; row++)
        {
            var values = ParseCsvLine(lines[row]);
            
            // 空行をスキップ
            if (values.Length < 2 || string.IsNullOrWhiteSpace(values[columnIndexes["タスクID"]]))
                continue;

            var ticketId = values[columnIndexes["タスクID"]].Trim();
            var title = GetSafeValue(values, columnIndexes, "タスク名").Trim();
            
            if (string.IsNullOrEmpty(title))
            {
                skipped++;
                continue;
            }

            // 既存チケットを検索
            var existingTicket = await _context.Tickets.FirstOrDefaultAsync(t => t.TicketId == ticketId);

            var ticket = existingTicket ?? new Ticket { TicketId = ticketId };
            
            ticket.Title = title;
            ticket.Progress = ParseProgress(GetSafeValue(values, columnIndexes, "バケット"));
            ticket.Column = MapStateToColumn(GetSafeValue(values, columnIndexes, "状態"));
            ticket.IsArchived = false;
            
            // 担当者の処理
            var assignee = GetSafeValue(values, columnIndexes, "担当者").Trim();
            ticket.Assignees = !string.IsNullOrEmpty(assignee) ? new List<string> { assignee } : new List<string>();
            if (existingTicket == null)
            {
                ticket.MainAssignee = !string.IsNullOrEmpty(assignee) ? assignee : null;
            }

            // 日付の処理
            ticket.StartDate = ParseDate(GetSafeValue(values, columnIndexes, "開始日"));
            ticket.EndDate = ParseDate(GetSafeValue(values, columnIndexes, "完了日"));

            // チェックリストの処理
            var checklistItems = GetSafeValue(values, columnIndexes, "チェックリスト項目");
            var completedChecklist = GetSafeValue(values, columnIndexes, "完成したチェックリスト項目");
            ticket.ChildTasks = ParseChecklist(checklistItems, completedChecklist);

            // ラベルの処理
            var labelsStr = GetSafeValue(values, columnIndexes, "ラベル");
            ticket.Labels = ParseSemicolonSeparated(labelsStr);

            // メモの処理
            ticket.Memo = GetSafeValue(values, columnIndexes, "メモ");

            if (existingTicket == null)
            {
                // 新規チケットのPosition設定
                var maxPosition = await _context.Tickets
                    .Where(t => t.Column == ticket.Column)
                    .MaxAsync(t => (int?)t.Position)
                    .ConfigureAwait(true);
                ticket.Position = (maxPosition ?? -1) + 1;
                ticket.Id = GenerateNewId();
                _context.Tickets.Add(ticket);
            }

            imported++;
        }

        await _context.SaveChangesAsync();
        return Ok(new { message = "インポートが完了しました", count = imported, skipped = skipped });
    }

    private static string[] ParseCsvLine(string line)
    {
        var result = new List<string>();
        var current = new StringBuilder();
        var inQuotes = false;
        
        foreach (char c in line)
        {
            if (c == '"')
            {
                inQuotes = !inQuotes;
            }
            else if (c == ',' && !inQuotes)
            {
                result.Add(current.ToString());
                current.Clear();
            }
            else
            {
                current.Append(c);
            }
        }
        result.Add(current.ToString());
        
        return result.ToArray();
    }

    private static string GetSafeValue(string[] values, Dictionary<string, int> columnIndexes, string columnName)
    {
        if (!columnIndexes.ContainsKey(columnName))
            return string.Empty;
        var index = columnIndexes[columnName];
        if (index >= values.Length)
            return string.Empty;
        return values[index];
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
        if (DateTime.TryParse(cleaned, out var date))
            return date;
        return null;
    }

    private static List<ChildTask> ParseChecklist(string itemsStr, string completedStr)
    {
        var result = new List<ChildTask>();
        if (string.IsNullOrWhiteSpace(itemsStr))
            return result;

        var items = itemsStr.Split(';')
            .Select(s => s.Trim())
            .Where(s => !string.IsNullOrEmpty(s))
            .ToList();

        // 完了数のパース (例: "1/3")
        int completedCount = 0;
        if (!string.IsNullOrWhiteSpace(completedStr))
        {
            var parts = completedStr.Split('/');
            if (parts.Length >= 1 && int.TryParse(parts[0], out var count))
                completedCount = count;
        }

        for (int i = 0; i < items.Count; i++)
        {
            result.Add(new ChildTask
            {
                Text = items[i],
                Done = i < completedCount
            });
        }

        return result;
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

    private int GenerateNewId()
    {
        var maxId = _context.Tickets.Max(t => (int?)t.Id) ?? 0;
        return maxId + 1;
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

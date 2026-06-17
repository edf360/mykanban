using KanbanServer.Data;
using KanbanServer.Models;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Services;

public class TicketService
{
    private readonly KanbanDbContext _context;

    public TicketService(KanbanDbContext context)
    {
        _context = context;
    }

    public async Task<List<Ticket>> GetAllAsync()
    {
        var tickets = await _context.Tickets.ToListAsync();
        // クライアントサイドでカラム順序を明示的にソート（EF CoreがDictionary.GetValueOrDefaultをSQL変換できないため）
        var columnOrderMap = new Dictionary<string, int> {
            { "todo", 0 }, { "doing", 1 }, { "done", 2 }, { "archive", 3 }
        };
        return tickets
            .OrderBy(t => columnOrderMap.GetValueOrDefault(t.Column.ToLowerInvariant(), 999))
            .ThenBy(t => t.Position)
            .ThenBy(t => t.Id)
            .ToList();
    }

    public async Task<Ticket?> GetAsync(string ticketId)
    {
        return await _context.Tickets.FindAsync(ticketId);
    }

    public async Task<Ticket> CreateAsync(TicketDto dto)
    {
        // タイトル検証
        if (string.IsNullOrWhiteSpace(dto.Title))
        {
            throw new ArgumentException("Title is required.", nameof(dto));
        }

        var validChildTasks = dto.ChildTasks
            .Where(ct => !string.IsNullOrWhiteSpace(ct.Text))
            .Select(ct => new ChildTask
            {
                Id = string.IsNullOrEmpty(ct.Id) ? Guid.NewGuid().ToString("N") : ct.Id,
                Text = ct.Text,
                Done = ct.Done,
                Progress = ct.Progress,
                Category = ct.Category
            })
            .ToList();

        var column = dto.Column ?? "todo";

        // 担当者がいるがメイン担当が未設定の場合は最初の担当者をメインに設定
        string? mainAssignee = dto.MainAssignee;
        if (string.IsNullOrEmpty(mainAssignee) && dto.Assignees != null && dto.Assignees.Count > 0)
        {
            mainAssignee = dto.Assignees[0];
        }
        
        var ticket = new Ticket
        {
            TicketId = Guid.NewGuid().ToString("N"),
            Title = dto.Title,
            Column = column,
            Position = 0,
            Progress = 0,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Effort = dto.Effort,
            Assignees = dto.Assignees ?? new List<string>(),
            MainAssignee = mainAssignee,
            Labels = dto.Labels,
            Memo = dto.Memo,
            ChildTasks = validChildTasks,
            IsLocked = dto.IsLocked,
            IsEmergency = dto.IsEmergency,
            Category = dto.Category
        };

        // Id は DB AUTOINCREMENT だが、既存制約のため一時的に設定
        var maxId = await _context.Tickets.MaxAsync(t => (int?)t.Id) ?? 0;
        ticket.Id = maxId + 1;

        var maxPosition = await _context.Tickets
            .Where(t => t.Column == column)
            .MaxAsync(t => (double?)t.Position) ?? -1000.0;
        ticket.Position = maxPosition + 1000.0;

        _context.Tickets.Add(ticket);

        var history = new TicketHistory
        {
            TicketId = ticket.TicketId,
            Type = "created",
            Value = null,
            PreviousValue = null,
            Date = DateTime.UtcNow
        };
        _context.TicketHistories.Add(history);

        await _context.SaveChangesAsync();
        return ticket;
    }

    public async Task<Ticket?> UpdateAsync(string ticketId, TicketDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return null;

        var oldTitle = ticket.Title;
        var oldAssigneesJson = ticket.AssigneesJson;
        var oldMainAssignee = ticket.MainAssignee;
        var oldLabelsJson = ticket.LabelsJson;
        var oldChildTasksJson = ticket.ChildTasksJson;
        var oldMemo = ticket.Memo;
        var oldStartDate = ticket.StartDate;
        var oldEndDate = ticket.EndDate;
        var oldEffort = ticket.Effort;
        var oldIsLocked = ticket.IsLocked;
        var oldColumn = ticket.Column;

        // タイトル検証
        if (string.IsNullOrWhiteSpace(dto.Title))
        {
            throw new ArgumentException("Title is required.", nameof(dto));
        }

        ticket.Title = dto.Title;
        if (!string.IsNullOrEmpty(dto.Column))
            ticket.Column = dto.Column;
        // null 値で既存データを上書きしない
        if (dto.StartDate.HasValue)
            ticket.StartDate = dto.StartDate;
        if (dto.EndDate.HasValue)
            ticket.EndDate = dto.EndDate;
        if (dto.Effort.HasValue)
            ticket.Effort = dto.Effort;
        if (dto.Assignees != null)
            ticket.Assignees = dto.Assignees;
        // 担当者がいるがメイン担当が未設定の場合は最初の担当者をメインに設定
        if (string.IsNullOrEmpty(dto.MainAssignee) && dto.Assignees != null && dto.Assignees.Count > 0)
        {
            ticket.MainAssignee = dto.Assignees[0];
        }
        else if (dto.MainAssignee != null)
        {
            ticket.MainAssignee = dto.MainAssignee;
        }
        if (dto.Labels != null)
            ticket.Labels = dto.Labels;
        ticket.Memo = dto.Memo;
        ticket.IsLocked = dto.IsLocked;
        ticket.IsEmergency = dto.IsEmergency;
        ticket.Category = dto.Category;
        if (dto.ChildTasks != null)
        {
            ticket.ChildTasks = dto.ChildTasks
                .Where(ct => !string.IsNullOrWhiteSpace(ct.Text))
                .Select(ct => new ChildTask
                {
                    Id = string.IsNullOrEmpty(ct.Id) ? Guid.NewGuid().ToString("N") : ct.Id,
                    Text = ct.Text,
                    Done = ct.Done,
                    Progress = ct.Progress,
                    Category = ct.Category
                })
                .ToList();
        }

        RecordHistoryIfChanged(ticketId, "title", ticket.Title, oldTitle);
        RecordHistoryIfChanged(ticketId, "column", ticket.Column, oldColumn);
        RecordHistoryIfChanged(ticketId, "assignee", ticket.AssigneesJson, oldAssigneesJson);
        RecordHistoryIfChanged(ticketId, "assignee", $"main:{ticket.MainAssignee}", $"main:{oldMainAssignee}");
        RecordHistoryIfChanged(ticketId, "label", ticket.LabelsJson, oldLabelsJson);
        RecordHistoryIfChanged(ticketId, "childtask", ticket.ChildTasksJson, oldChildTasksJson);
        RecordHistoryIfChanged(ticketId, "memo", ticket.Memo, oldMemo);
        RecordHistoryIfChanged(ticketId, "date-start", ticket.StartDate?.ToString("yyyy-MM-dd"), oldStartDate?.ToString("yyyy-MM-dd"));
        RecordHistoryIfChanged(ticketId, "date-end", ticket.EndDate?.ToString("yyyy-MM-dd"), oldEndDate?.ToString("yyyy-MM-dd"));
        RecordHistoryIfChanged(ticketId, "effort", ticket.Effort?.ToString(), oldEffort?.ToString());
        RecordHistoryIfChanged(ticketId, "lock", ticket.IsLocked ? "locked" : "unlocked", oldIsLocked ? "locked" : "unlocked");

        await _context.SaveChangesAsync();
        return ticket;
    }

    /// <summary>
    /// チケットをアーカイブに移動（ソフトデリート）
    /// 既にアーカイブ済みの場合は何もしない
    /// </summary>
    public async Task<Ticket?> ArchiveAsync(string ticketId)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return null;

        if (ticket.IsArchived)
        {
            // 既にアーカイブ済みなので何もしない
            return ticket;
        }

        ticket.PreviousColumn = ticket.Column;
        ticket.IsArchived = true;
        ticket.Column = "archive";
        ticket.Position = 0;
        await _context.SaveChangesAsync();
        return ticket;
    }

    /// <summary>
    /// チケットを完全に削除（ハードデリート）
    /// 管理者のみが使用可能
    /// </summary>
    public async Task<bool> DeleteAsync(string ticketId)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return false;

        _context.Tickets.Remove(ticket);
        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Ticket?> RestoreAsync(string ticketId)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return null;

        // アーカイブ前のカラムを復元（未設定の場合はtodo）
        var restoreColumn = !string.IsNullOrEmpty(ticket.PreviousColumn)
            ? ticket.PreviousColumn
            : "todo";

        ticket.IsArchived = false;
        ticket.Column = restoreColumn;

        // 復元先カラムの末尾に配置
        var maxPos = await _context.Tickets
            .Where(t => t.Column == restoreColumn && t.TicketId != ticket.TicketId)
            .MaxAsync(t => (double?)t.Position) ?? -1000.0;
        ticket.Position = maxPos + 1000.0;

        ticket.PreviousColumn = null;
        await _context.SaveChangesAsync();
        return ticket;
    }

    public async Task<bool> UpdateColumnAsync(string ticketId, ColumnUpdateDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return false;

        var oldColumn = ticket.Column;
        var newColumn = dto.Column;
        ticket.Column = newColumn;

        if (oldColumn != newColumn)
        {
            RecordHistory(ticketId, "column", newColumn, oldColumn);
        }

        if (dto.InsertIndex.HasValue)
        {
            int insertIdx = dto.InsertIndex.Value;

            var ordered = await _context.Tickets
                .Where(t => t.Column == newColumn && t.TicketId != ticketId)
                .OrderBy(t => t.Position)
                .ThenBy(t => t.Id)
                .ToListAsync();

            double newPos;

            if (insertIdx <= 0)
            {
                newPos = ordered.Count > 0 ? ordered[0].Position - 1000.0 : 0.0;
            }
            else if (insertIdx >= ordered.Count)
            {
                newPos = ordered.Count > 0 ? ordered[ordered.Count - 1].Position + 1000.0 : 0.0;
            }
            else
            {
                newPos = (ordered[insertIdx - 1].Position + ordered[insertIdx].Position) / 2.0;
            }

            var hasConflict = await _context.Tickets
                .Where(t => t.Column == newColumn && t.TicketId != ticketId)
                .AnyAsync(t => Math.Abs(t.Position - newPos) < 100.0);

            if (hasConflict)
            {
                await RepositionColumn(newColumn, ticketId);
                ordered = await _context.Tickets
                    .Where(t => t.Column == newColumn && t.TicketId != ticketId)
                    .OrderBy(t => t.Position)
                    .ThenBy(t => t.Id)
                    .ToListAsync();

                if (insertIdx <= 0)
                {
                    newPos = ordered.Count > 0 ? ordered[0].Position - 1000.0 : 0.0;
                }
                else if (insertIdx >= ordered.Count)
                {
                    newPos = ordered.Count > 0 ? ordered[ordered.Count - 1].Position + 1000.0 : 0.0;
                }
                else
                {
                    newPos = (ordered[insertIdx - 1].Position + ordered[insertIdx].Position) / 2.0;
                }
            }

            ticket.Position = newPos;

            if (oldColumn != newColumn)
            {
                await RepositionColumn(oldColumn, ticketId);
            }
        }
        else
        {
            var maxPos = await _context.Tickets
                .Where(t => t.Column == dto.Column && t.TicketId != ticketId)
                .MaxAsync(t => (double?)t.Position) ?? -1000.0;
            ticket.Position = maxPos + 1000.0;

            if (oldColumn != dto.Column)
            {
                await RepositionColumn(oldColumn, ticketId);
            }
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<bool> UpdateProgressAsync(string ticketId, ProgressUpdateDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return false;

        // 子タスクがある場合は進捗を直接更新できない
        if (ticket.ChildTasks != null && ticket.ChildTasks.Count > 0)
        {
            return false;
        }

        var oldProgress = ticket.Progress;
        ticket.Progress = Math.Max(0, Math.Min(100, dto.Progress));

        if (oldProgress != ticket.Progress)
        {
            RecordHistory(ticketId, "progress", ticket.Progress.ToString(), oldProgress.ToString());
        }

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Ticket?> UpdateChildTaskAsync(string ticketId, string childId, ChildTaskUpdateDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return null;

        var childTasks = ticket.ChildTasks;
        var childTask = childTasks?.FirstOrDefault(ct => ct.Id == childId);
        if (childTask == null) return null;

        childTask.Done = dto.Done;
        if (dto.Progress.HasValue)
        {
            childTask.Progress = Math.Max(0, Math.Min(100, dto.Progress.Value));
        }
        if (!string.IsNullOrEmpty(dto.ReviewState))
        {
            childTask.ReviewState = dto.ReviewState;
        }
        ticket.ChildTasks = childTasks!;

        // 子タスクの進捗からメインタスクの進捗を平均値で計算
        if (childTasks != null && childTasks.Count > 0)
        {
            ticket.Progress = (int)Math.Round(childTasks.Average(ct => ct.Progress));
        }

        await _context.SaveChangesAsync();

        return ticket;
    }

    public async Task<List<TicketHistory>> GetHistoryAsync(string ticketId)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return new List<TicketHistory>();

        return await _context.TicketHistories
            .Where(h => h.TicketId == ticketId)
            .OrderByDescending(h => h.Date)
            .ThenBy(h => h.Type)
            .ToListAsync();
    }

    public async Task<List<LabelSuggestDto>> GetLabelsSuggestAsync()
    {
        var setting = await _context.Settings.FirstOrDefaultAsync();
        var labelMap = new Dictionary<string, string>();

        if (setting?.Labels != null)
        {
            foreach (var lc in setting.Labels.OrderBy(l => l.Name))
            {
                labelMap[lc.Name] = lc.Color;
            }
        }

        var tickets = await _context.Tickets
            .Where(t => t.LabelsJson != null && t.LabelsJson.Length > 2)
            .ToListAsync();
        foreach (var ticket in tickets)
        {
            try
            {
                var labels = System.Text.Json.JsonSerializer.Deserialize<List<string>>(ticket.LabelsJson);
                if (labels != null)
                {
                    foreach (var label in labels)
                    {
                        if (!labelMap.ContainsKey(label))
                        {
                            labelMap[label] = "#808080";
                        }
                    }
                }
            }
            catch (System.Text.Json.JsonException)
            {
                // 無効なJSONはスキップ
            }
        }

        return labelMap.OrderBy(kvp => kvp.Key)
            .Select(kvp => new LabelSuggestDto { Name = kvp.Key, Color = kvp.Value })
            .ToList();
    }

    public async Task<List<string>> GetAssigneesSuggestAsync()
    {
        // 設定ウィンドウのユーザー順序を保持
        var setting = await _context.Settings.FirstOrDefaultAsync();
        List<string> orderedAssignees;
        if (setting?.Users != null)
        {
            orderedAssignees = setting.Users.ToList();
        }
        else
        {
            orderedAssignees = new List<string>();
        }

        // チケットから追加の担当者を収集
        var tickets = await _context.Tickets
            .Where(t => t.AssigneesJson != null && t.AssigneesJson.Length > 2)
            .ToListAsync();
        foreach (var ticket in tickets)
        {
            try
            {
                var assignees = System.Text.Json.JsonSerializer.Deserialize<List<string>>(ticket.AssigneesJson);
                if (assignees != null)
                {
                    foreach (var assignee in assignees)
                    {
                        if (!orderedAssignees.Contains(assignee))
                        {
                            orderedAssignees.Add(assignee);
                        }
                    }
                }
            }
            catch (System.Text.Json.JsonException)
            {
                // 無効なJSONはスキップ
            }
        }

        return orderedAssignees;
    }

    /// <summary>
    /// 指定カラムのチケットのPositionを再配置
    /// 注意: このメソッド自体はSaveChangesAsyncを呼び出さない。
    /// 呼び元でSaveChangesAsyncを呼び出す必要がある。
    /// </summary>
    private async Task RepositionColumn(string column, string? excludeTicketId = null)
    {
        var tickets = await _context.Tickets
            .Where(t => t.Column == column && (excludeTicketId == null || t.TicketId != excludeTicketId))
            .OrderBy(t => t.Position)
            .ThenBy(t => t.Id)
            .ToListAsync();

        for (int i = 0; i < tickets.Count; i++)
        {
            tickets[i].Position = i * 1000.0;
        }
        // Positionの変更は呼び元でSaveChangesAsyncにより保存される
    }

    private void RecordHistory(string ticketId, string type, string? value, string? previousValue)
    {
        try
        {
            var history = new TicketHistory
            {
                TicketId = ticketId,
                Type = type,
                Value = value,
                PreviousValue = previousValue,
                Date = DateTime.UtcNow
            };
            _context.TicketHistories.Add(history);
        }
        catch (Exception ex)
        {
            // Serilogを使用して本番環境でもログ出力
            var log = Serilog.Log.Logger;
            log.Error(ex, "履歴記録に失敗しました: TicketId={TicketId}, Type={Type}", ticketId, type);
        }
    }

    private void RecordHistoryIfChanged(string ticketId, string type, string? newValue, string? oldValue)
    {
        if (newValue != oldValue)
        {
            RecordHistory(ticketId, type, newValue, oldValue);
        }
    }
}
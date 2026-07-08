using KanbanServer.Data;
using KanbanServer.Models;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Services;

public class TicketService
{
    private readonly KanbanDbContext _context;

    // カラム順序マップ（EF CoreがDictionary.GetValueOrDefaultをSQL変換できないためクライアントサイドソート）
    private static readonly Dictionary<string, int> ColumnOrderMap = new()
    {
        { "todo", 0 }, { "doing", 1 }, { "done", 2 }, { "archive", 3 }
    };

    public TicketService(KanbanDbContext context)
    {
        _context = context;
    }

    public async Task<List<Ticket>> GetAllAsync()
    {
        var tickets = await _context.Tickets.ToListAsync();
        return tickets
            .OrderBy(t => ColumnOrderMap.GetValueOrDefault(t.Column.ToLowerInvariant(), 999))
            .ThenByDescending(t => t.Position)
            .ThenBy(t => t.Id)
            .ToList();
    }

    public async Task<Ticket?> GetAsync(string ticketId)
    {
        return await _context.Tickets.FindAsync(ticketId);
    }

    public async Task<Ticket> CreateAsync(TicketDto dto, string? username = null)
    {
        // タイトル検証
        if (string.IsNullOrEmpty(dto.Title))
        {
            throw new ArgumentException("タイトルは必須です。", nameof(dto));
        }

        var validChildTasks = dto.ChildTasks
            .Where(ct => !string.IsNullOrWhiteSpace(ct.Text))
            .Select((ct, index) => new ChildTask
            {
                Id = string.IsNullOrEmpty(ct.Id) ? Guid.NewGuid().ToString("N") : ct.Id,
                Text = ct.Text,
                Done = ct.Done,
                Progress = ct.Progress,
                Category = ct.Category,
                Memo = ct.Memo,
                ReviewState = ct.ReviewState ?? "none",
                OrderIndex = index
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
            IsLocked = dto.IsLocked,
            IsEmergency = dto.IsEmergency,
            Category = dto.Category,
            CreatedAt = DateTime.Now,
            CreatedBy = username
        };

        // Id は MaxAsync + 1 で生成（インメモリSQLiteテストとの互換性のためAUTOINCREMENT不使用）
        var maxId = await _context.Tickets.MaxAsync(t => (int?)t.Id) ?? 0;
        ticket.Id = maxId + 1;

        var existingPositions = await _context.Tickets
            .Where(t => t.Column == column)
            .Select(t => t.Position)
            .ToListAsync();
        ticket.Position = existingPositions.Count == 0 ? 0 : existingPositions.Max() + 1000.0;

        _context.Tickets.Add(ticket);

        // 子タスクを独立テーブルにも保存（ナビゲーションプロパティ経由）
        foreach (var ct in validChildTasks)
        {
            ticket.ChildTasksEntities.Add(new ChildTask
            {
                Id = ct.Id,
                TicketId = ticket.TicketId,
                Text = ct.Text,
                Done = ct.Done,
                Progress = ct.Progress,
                Category = ct.Category,
                Memo = ct.Memo,
                ReviewState = ct.ReviewState ?? "none",
                OrderIndex = ct.OrderIndex,
                CreatedAt = DateTime.Now
            });
        }

        await _context.SaveChangesAsync();
        return ticket;
    }

    public async Task<Ticket?> UpdateAsync(string ticketId, TicketDto dto, string? username = null)
    {
        var ticket = await _context.Tickets
            .Include(t => t.ChildTasksEntities)
            .FirstOrDefaultAsync(t => t.TicketId == ticketId);
        if (ticket == null) return null;

        // タイトル検証
        if (string.IsNullOrEmpty(dto.Title))
        {
            throw new ArgumentException("タイトルは必須です。", nameof(dto));
        }

        // 監査列の更新
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        var oldTitle = ticket.Title;
        var oldAssignees = ticket.Assignees;
        var oldMainAssignee = ticket.MainAssignee;
        var oldLabels = ticket.Labels;
        var oldMemo = ticket.Memo;
        var oldStartDate = ticket.StartDate;
        var oldEndDate = ticket.EndDate;
        var oldEffort = ticket.Effort;
        var oldIsLocked = ticket.IsLocked;
        var oldColumn = ticket.Column;

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
            var validChildTasks = dto.ChildTasks
                .Where(ct => !string.IsNullOrWhiteSpace(ct.Text))
                .Select((ct, index) => new ChildTask
                {
                    Id = string.IsNullOrEmpty(ct.Id) ? Guid.NewGuid().ToString("N") : ct.Id,
                    Text = ct.Text,
                    Done = ct.Done,
                    Progress = ct.Progress,
                    Category = ct.Category,
                    Memo = ct.Memo,
                    ReviewState = ct.ReviewState ?? "none"
                })
                .ToList();

            // 独立テーブルの子タスクを同期
            var existingChildTasks = await _context.ChildTasks
                .Where(ct => ct.TicketId == ticketId)
                .ToListAsync();
            var existingIds = existingChildTasks.Select(ct => ct.Id).ToHashSet();
            var newIds = validChildTasks.Select(ct => ct.Id).ToHashSet();

            // 削除された子タスクを削除
            var toRemove = existingChildTasks.Where(ct => !newIds.Contains(ct.Id)).ToList();
            if (toRemove.Count > 0)
            {
                _context.ChildTasks.RemoveRange(toRemove);
            }

            // 新規または更新された子タスクを追加/更新
            foreach (var ct in validChildTasks)
            {
                var existing = existingChildTasks.FirstOrDefault(c => c.Id == ct.Id);
                if (existing != null)
                {
                    // 更新
                    existing.Text = ct.Text;
                    existing.Done = ct.Done;
                    existing.Progress = ct.Progress;
                    existing.Category = ct.Category;
                    existing.Memo = ct.Memo;
                    existing.ReviewState = ct.ReviewState ?? "none";
                    existing.UpdatedAt = DateTime.Now;
                }
                else
                {
                    // 新規追加
                    ticket.ChildTasksEntities.Add(new ChildTask
                    {
                        Id = ct.Id,
                        TicketId = ticketId,
                        Text = ct.Text,
                        Done = ct.Done,
                        Progress = ct.Progress,
                        Category = ct.Category,
                        Memo = ct.Memo,
                        ReviewState = ct.ReviewState ?? "none",
                        OrderIndex = validChildTasks.IndexOf(ct),
                        CreatedAt = DateTime.Now
                    });
                }
            }
        }

        await _context.SaveChangesAsync();
        return ticket;
    }

    /// <summary>
    /// チケットをアーカイブに移動（ソフトデリート）
    /// 既にアーカイブ済みの場合は何もしない
    /// </summary>
    public async Task<Ticket?> ArchiveAsync(string ticketId, string? username = null)
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
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;
        await _context.SaveChangesAsync();
        return ticket;
    }

    /// <summary>
    /// チケットを完全に削除（ハードデリート）
    /// 管理者のみが使用可能
    /// </summary>
    public async Task<bool> DeleteAsync(string ticketId, string? username = null)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return false;

        // アーカイブ済みチケットは完全削除
        if (ticket.IsArchived)
        {
            // 子タスクの実績も削除
            var actuals = await _context.TicketActuals.Where(a => a.TicketId == ticketId).ToListAsync();
            if (actuals.Count > 0)
            {
                _context.TicketActuals.RemoveRange(actuals);
            }

            // 独立テーブルの子タスクも削除
            var childTasks = await _context.ChildTasks.Where(ct => ct.TicketId == ticketId).ToListAsync();
            if (childTasks.Count > 0)
            {
                _context.ChildTasks.RemoveRange(childTasks);
            }

            _context.Tickets.Remove(ticket);
        }
        else
        {
            // ソフト削除
            ticket.IsDeleted = true;
            ticket.DeletedAt = DateTime.Now;
        }

        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Ticket?> RestoreAsync(string ticketId, string? username = null)
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
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;
        await _context.SaveChangesAsync();
        return ticket;
    }

    public async Task<bool> UpdateColumnAsync(string ticketId, ColumnUpdateDto dto, string? username = null)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return false;

        // 監査列の更新
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        var oldColumn = ticket.Column;
        var newColumn = dto.Column;
        ticket.Column = newColumn;

        if (dto.InsertIndex.HasValue)
        {
            int insertIdx = dto.InsertIndex.Value;

            // Position降順でソート（大きい値が先頭＝上部に表示）
            var ordered = await _context.Tickets
                .Where(t => t.Column == newColumn && t.TicketId != ticketId)
                .OrderByDescending(t => t.Position)
                .ThenBy(t => t.Id)
                .ToListAsync();

            double newPos;

            if (insertIdx <= 0)
            {
                // 先頭（上部）に挿入：最大のpositionより大きくする
                newPos = ordered.Count > 0 ? ordered[0].Position + 1000.0 : 0.0;
            }
            else if (insertIdx >= ordered.Count)
            {
                // 末尾（下部）に挿入：最小のpositionより小さくする
                newPos = ordered.Count > 0 ? ordered[ordered.Count - 1].Position - 1000.0 : 0.0;
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
                    .OrderByDescending(t => t.Position)
                    .ThenBy(t => t.Id)
                    .ToListAsync();

                if (insertIdx <= 0)
                {
                    newPos = ordered.Count > 0 ? ordered[0].Position + 1000.0 : 0.0;
                }
                else if (insertIdx >= ordered.Count)
                {
                    newPos = ordered.Count > 0 ? ordered[ordered.Count - 1].Position - 1000.0 : 0.0;
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
            // 先頭（上部）に配置：最大のpositionより大きくする
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

    public async Task<bool> UpdateProgressAsync(string ticketId, ProgressUpdateDto dto, string? username = null)
    {
        var ticket = await _context.Tickets.FindAsync(ticketId);
        if (ticket == null) return false;

        // 監査列の更新
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        // 子タスクがある場合は進捗を直接更新できない
        if (ticket.ChildTasksEntities != null && ticket.ChildTasksEntities.Count > 0)
        {
            return false;
        }

        var oldProgress = ticket.Progress;
        ticket.Progress = Math.Max(0, Math.Min(100, dto.Progress));

        await _context.SaveChangesAsync();
        return true;
    }

    public async Task<Ticket?> UpdateChildTaskAsync(string ticketId, string childId, ChildTaskUpdateDto dto, string? username = null)
    {
        var ticket = await _context.Tickets
            .Include(t => t.ChildTasksEntities)
            .FirstOrDefaultAsync(t => t.TicketId == ticketId);
        if (ticket == null) return null;

        // 監査列の更新
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        var childTasks = ticket.ChildTasksEntities;
        var childTask = childTasks?.FirstOrDefault(ct => ct.Id == childId);
        if (childTask == null) return null;

        var oldChildProgress = childTask.Progress;
        var oldTicketProgress = ticket.Progress;

        childTask.Done = dto.Done;
        if (dto.Progress.HasValue)
        {
            var newProgress = Math.Max(0, Math.Min(100, dto.Progress.Value));
            childTask.Progress = newProgress;
        }
        if (!string.IsNullOrEmpty(dto.ReviewState))
        {
            childTask.ReviewState = dto.ReviewState;
        }
        childTask.UpdatedAt = DateTime.Now;

        // 子タスクの進捗からメインタスクの進捗を平均値で計算
        if (childTasks != null && childTasks.Count > 0)
        {
            ticket.Progress = (int)Math.Round(childTasks.Average(ct => ct.Progress));
        }

        await _context.SaveChangesAsync();

        return ticket;
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

        // 中間テーブルからラベルを取得
        var ticketLabels = await _context.TicketLabels.Select(tl => tl.Label).Distinct().ToListAsync();
        foreach (var label in ticketLabels)
        {
            if (!labelMap.ContainsKey(label))
            {
                labelMap[label] = "#808080";
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

        // 中間テーブルから担当者を収集
        var ticketAssignees = await _context.TicketAssignees.Select(ta => ta.Assignee).Distinct().ToListAsync();
        foreach (var assignee in ticketAssignees)
        {
            if (!orderedAssignees.Contains(assignee))
            {
                orderedAssignees.Add(assignee);
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
        // Position降順でソート（大きい値が先頭＝上部に表示）
        var tickets = await _context.Tickets
            .Where(t => t.Column == column && (excludeTicketId == null || t.TicketId != excludeTicketId))
            .OrderByDescending(t => t.Position)
            .ThenBy(t => t.Id)
            .ToListAsync();

        // 先頭から大きな値を割り当て（降順で配置）
        for (int i = 0; i < tickets.Count; i++)
        {
            tickets[i].Position = (tickets.Count - i) * 1000.0;
        }
        // Positionの変更は呼び元でSaveChangesAsyncにより保存される
    }

}
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
        var tickets = await _context.Tickets
            .Include(t => t.ChildTasksEntities)
            .Include(t => t.TicketLabels)
            .Include(t => t.TicketAssignees)
            .ToListAsync();
        return tickets
            .OrderBy(t => ColumnOrderMap.GetValueOrDefault(t.Column.ToLowerInvariant(), 999))
            .ThenByDescending(t => t.Position)
            .ThenBy(t => t.CreatedAt)
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
        if (dto.Title.Length > 200)
        {
            throw new ArgumentException("タイトルは200文字以内でください。", nameof(dto));
        }

        var validChildTasks = dto.ChildTasks
            .Where(ct => !string.IsNullOrWhiteSpace(ct.Text))
            .Select((ct, index) => new ChildTask
            {
                Id = string.IsNullOrEmpty(ct.Id) ? Guid.NewGuid().ToString("N") : ct.Id,
                Text = ct.Text,
                Done = ct.Done,
                Category = ct.Category,
                Memo = ct.Memo,
                ReviewState = ct.ReviewState ?? "none",
                OrderIndex = index
            })
            .ToList();

        var column = dto.Column ?? "todo";

        // 【BUG-04修正】Position計算をチケット保存前に完了し、例外発生時も正しい値を設定
        var existingPositions = await _context.Tickets
            .Where(t => t.Column == column)
            .Select(t => t.Position)
            .ToListAsync();
        var initialPosition = existingPositions.Count == 0 ? 0 : existingPositions.Max() + 1000.0;

        var ticket = new Ticket
        {
            TicketId = Guid.NewGuid().ToString("N"),
            Title = dto.Title,
            Column = column,
            Position = initialPosition,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Effort = dto.Effort,
            // Assigneesプロパティを使わない（TicketAssigneesを直接操作するため）
            Labels = dto.Labels,
            Memo = dto.Memo,
            IsLocked = dto.IsLocked,
            IsEmergency = dto.IsEmergency,
            Category = dto.Category,
            CreatedAt = DateTime.Now,
            CreatedBy = username
        };

        _context.Tickets.Add(ticket);

        // 担当者をTicketAssigneesに保存
        if (dto.Assignees != null && dto.Assignees.Count > 0)
        {
            foreach (var assignee in dto.Assignees)
            {
                ticket.TicketAssignees.Add(new TicketAssignee
                {
                    TicketId = ticket.TicketId,
                    Assignee = assignee,
                    IsPrimary = assignee == dto.MainAssignee
                });
            }
        }

        // 子タスクを独立テーブルにも保存（ナビゲーションプロパティ経由）
        foreach (var ct in validChildTasks)
        {
            ticket.ChildTasksEntities.Add(new ChildTask
            {
                Id = ct.Id,
                TicketId = ticket.TicketId,
                Text = ct.Text,
                Done = ct.Done,
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
            .Include(t => t.TicketLabels)
            .Include(t => t.TicketAssignees)
            .FirstOrDefaultAsync(t => t.TicketId == ticketId);
        if (ticket == null) return null;

        // タイトル検証
        if (string.IsNullOrEmpty(dto.Title))
        {
            throw new ArgumentException("タイトルは必須です。", nameof(dto));
        }
        if (dto.Title.Length > 200)
        {
            throw new ArgumentException("タイトルは200文字以内でください。", nameof(dto));
        }

        // 監査列の更新
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        var oldTitle = ticket.Title;
        var oldAssignees = ticket.Assignees;
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
        {
            ticket.Assignees = dto.Assignees;
            // TicketAssigneesを更新（IsPrimaryを含む）
            // ナビゲーションプロパティ経由で操作してEF Coreトラッキング競合を避ける
            var existingAssignees = ticket.TicketAssignees.ToList();
            foreach (var ea in existingAssignees)
            {
                ticket.TicketAssignees.Remove(ea);
            }
            
            foreach (var assignee in dto.Assignees)
            {
                ticket.TicketAssignees.Add(new TicketAssignee
                {
                    TicketId = ticketId,
                    Assignee = assignee,
                    IsPrimary = assignee == dto.MainAssignee
                });
            }
        }
        if (dto.Labels != null)
            ticket.Labels = dto.Labels;
        // 【BUG-11修正】Memoがnullまたは空の場合、既存値を保持する
        if (dto.Memo != null)
            ticket.Memo = dto.Memo;
        // IsLocked/IsEmergencyはbool値のためデフォルトfalseが既存値を上書きする
        // 後方互換性維持のため无条件更新のままとする
        ticket.IsLocked = dto.IsLocked;
        ticket.IsEmergency = dto.IsEmergency;
        // Categoryはnullで既存値を上書きしない
        if (dto.Category != null)
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
                    Category = ct.Category,
                    Memo = ct.Memo,
                    ReviewState = ct.ReviewState ?? "none"
                })
                .ToList();

            // ナビゲーションプロパティ経由で子タスクを同期（EF Coreの追跡競合を避ける）
            var existingChildTasks = ticket.ChildTasksEntities.ToList();
            var existingIds = existingChildTasks.Select(ct => ct.Id).ToHashSet();
            var newIds = validChildTasks.Select(ct => ct.Id).ToHashSet();

            // 削除された子タスクをナビゲーションプロパティから削除
            var toRemove = existingChildTasks.Where(ct => !newIds.Contains(ct.Id)).ToList();
            foreach (var removeCt in toRemove)
            {
                ticket.ChildTasksEntities.Remove(removeCt);
            }

            // 新規または更新された子タスクを追加/更新
            foreach (var ct in validChildTasks)
            {
                var existing = ticket.ChildTasksEntities.FirstOrDefault(c => c.Id == ct.Id);
                if (existing != null)
                {
                    // 更新
                    existing.Text = ct.Text;
                    existing.Done = ct.Done;
                    existing.Category = ct.Category;
                    existing.Memo = ct.Memo;
                    existing.ReviewState = ct.ReviewState ?? "none";
                    existing.OrderIndex = validChildTasks.IndexOf(ct);
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
            // ソフト削除 - 関連データも論理削除（IsDeletedフラグ設定）
            ticket.IsDeleted = true;
            ticket.DeletedAt = DateTime.Now;

            // 関連する実績データもソフト削除（IsDeletedフラグがあれば設定、なければ物理削除）
            var actuals = await _context.TicketActuals.Where(a => a.TicketId == ticketId).ToListAsync();
            if (actuals.Count > 0)
            {
                _context.TicketActuals.RemoveRange(actuals);
            }

            // 関連する子タスクも削除
            var childTasks = await _context.ChildTasks.Where(ct => ct.TicketId == ticketId).ToListAsync();
            if (childTasks.Count > 0)
            {
                _context.ChildTasks.RemoveRange(childTasks);
            }
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

        // アーカイブ前のカラムを復元（PreviousColumnが削除されたので常にtodo）
        var restoreColumn = "todo";

        ticket.IsArchived = false;
        ticket.Column = restoreColumn;

        // 復元先カラムの末尾に配置
        var maxPos = await _context.Tickets
            .Where(t => t.Column == restoreColumn && t.TicketId != ticket.TicketId)
            .MaxAsync(t => (double?)t.Position) ?? -1000.0;
        ticket.Position = maxPos + 1000.0;

        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;
        await _context.SaveChangesAsync();
        return ticket;
    }

    public async Task<bool> UpdateColumnAsync(string ticketId, ColumnUpdateDto dto, string? username = null)
    {
        var ticket = await _context.Tickets
            .Include(t => t.ChildTasksEntities)
            .Include(t => t.TicketLabels)
            .Include(t => t.TicketAssignees)
            .FirstOrDefaultAsync(t => t.TicketId == ticketId);
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
                .ThenBy(t => t.CreatedAt)
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
                    .ThenBy(t => t.CreatedAt)
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

    public async Task<Ticket?> UpdateChildTaskAsync(string ticketId, string childId, ChildTaskUpdateDto dto, string? username = null)
    {
        var ticket = await _context.Tickets
            .Include(t => t.ChildTasksEntities)
            .Include(t => t.TicketLabels)
            .Include(t => t.TicketAssignees)
            .FirstOrDefaultAsync(t => t.TicketId == ticketId);
        if (ticket == null) return null;

        // 監査列の更新
        ticket.UpdatedAt = DateTime.Now;
        ticket.UpdatedBy = username;

        var childTasks = ticket.ChildTasksEntities;
        var childTask = childTasks?.FirstOrDefault(ct => ct.Id == childId);
        if (childTask == null) return null;

        childTask.Done = dto.Done;
        if (!string.IsNullOrEmpty(dto.ReviewState))
        {
            childTask.ReviewState = dto.ReviewState;
        }
        childTask.UpdatedAt = DateTime.Now;

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
            .ThenBy(t => t.CreatedAt)
            .ToListAsync();

        // 先頭から大きな値を割り当て（降順で配置）
        for (int i = 0; i < tickets.Count; i++)
        {
            tickets[i].Position = (tickets.Count - i) * 1000.0;
        }
        // Positionの変更は呼び元でSaveChangesAsyncにより保存される
    }

}
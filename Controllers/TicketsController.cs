using KanbanServer.Data;
using KanbanServer.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Controllers;

[ApiController]
[Route("api/tickets")]
public class TicketsController : ControllerBase
{
    private readonly KanbanDbContext _context;

    public TicketsController(KanbanDbContext context)
    {
        _context = context;
    }

    /// <summary>
    /// チケット一覧を取得（Position順にソート）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<Ticket>>> GetAll()
    {
        var tickets = await _context.Tickets.OrderBy(t => t.IsArchived).ThenBy(t => t.Column).ThenBy(t => t.Position).ToListAsync();
        return Ok(tickets);
    }

    /// <summary>
    /// 新規チケットを作成
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Ticket>> Create([FromBody] TicketDto dto)
    {
        // 最大Idを取得して+1
        var maxId = await _context.Tickets.MaxAsync(t => (int?)t.Id) ?? 0;

        var ticket = new Ticket
        {
            TicketId = Guid.NewGuid().ToString("N"),
            Id = maxId + 1,
            Title = dto.Title,
            Column = dto.Column ?? "todo",
            Position = 0,  // 後に再計算
            Progress = 0,
            StartDate = dto.StartDate,
            EndDate = dto.EndDate,
            Effort = dto.Effort,
            Assignees = dto.Assignees,
            MainAssignee = dto.MainAssignee,
            Labels = dto.Labels,
            Memo = dto.Memo,
            ChildTasks = dto.ChildTasks.Select(ct => new ChildTask { Text = ct.Text, Done = ct.Done }).ToList()
        };

        // 同じカラム内の最大Positionを取得（double方式）
        var maxPosition = await _context.Tickets
            .Where(t => t.Column == ticket.Column)
            .MaxAsync(t => (double?)t.Position) ?? -1.0;
        ticket.Position = maxPosition + 1.0;

        _context.Tickets.Add(ticket);
        
        // 作成履歴を記録
        var history = new TicketHistory
        {
            TicketId = ticket.TicketId,
            Type = "created",
            Value = null,
            PreviousValue = null,
            Date = DateTime.Now
        };
        _context.TicketHistories.Add(history);
        
        await _context.SaveChangesAsync();

        return CreatedAtAction(nameof(GetAll), new { id = ticket.TicketId }, ticket);
    }

    /// <summary>
    /// チケットを完全に更新
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Ticket>> Update(string id, [FromBody] TicketDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        // 変更前の値を保存
        var oldTitle = ticket.Title;
        var oldAssigneesJson = ticket.AssigneesJson;
        var oldMainAssignee = ticket.MainAssignee;
        var oldLabelsJson = ticket.LabelsJson;
        var oldChildTasksJson = ticket.ChildTasksJson;
        var oldMemo = ticket.Memo;
        var oldStartDate = ticket.StartDate;
        var oldEndDate = ticket.EndDate;
        var oldEffort = ticket.Effort;

        // フィールド更新
        ticket.Title = dto.Title;
        if (!string.IsNullOrEmpty(dto.Column))
            ticket.Column = dto.Column;
        ticket.StartDate = dto.StartDate;
        ticket.EndDate = dto.EndDate;
        ticket.Effort = dto.Effort;
        ticket.Assignees = dto.Assignees;
        ticket.MainAssignee = dto.MainAssignee;
        ticket.Labels = dto.Labels;
        ticket.Memo = dto.Memo;
        ticket.ChildTasks = dto.ChildTasks.Select(ct => new ChildTask { Text = ct.Text, Done = ct.Done }).ToList();

        // 変更検出と履歴記録
        if (oldTitle != ticket.Title)
            await RecordHistory(id, "title", ticket.Title, oldTitle);
        
        if (oldAssigneesJson != ticket.AssigneesJson)
            await RecordHistory(id, "assignee", ticket.AssigneesJson, oldAssigneesJson);
        
        if (oldMainAssignee != ticket.MainAssignee)
            await RecordHistory(id, "assignee", $"main:{ticket.MainAssignee}", $"main:{oldMainAssignee}");
        
        if (oldLabelsJson != ticket.LabelsJson)
            await RecordHistory(id, "label", ticket.LabelsJson, oldLabelsJson);
        
        if (oldChildTasksJson != ticket.ChildTasksJson)
            await RecordHistory(id, "childtask", ticket.ChildTasksJson, oldChildTasksJson);
        
        if (oldMemo != ticket.Memo)
            await RecordHistory(id, "memo", ticket.Memo, oldMemo);
        
        if (oldStartDate != ticket.StartDate)
            await RecordHistory(id, "date-start", ticket.StartDate?.ToString("yyyy-MM-dd"), oldStartDate?.ToString("yyyy-MM-dd"));
        
        if (oldEndDate != ticket.EndDate)
            await RecordHistory(id, "date-end", ticket.EndDate?.ToString("yyyy-MM-dd"), oldEndDate?.ToString("yyyy-MM-dd"));
        
        if (oldEffort != ticket.Effort)
            await RecordHistory(id, "effort", ticket.Effort?.ToString(), oldEffort?.ToString());

        await _context.SaveChangesAsync();
        return Ok(ticket);
    }

    /// <summary>
    /// 履歴を記録（全ての変更を保存）
    /// </summary>
    private async Task RecordHistory(string ticketId, string type, string? value, string? previousValue)
    {
        var history = new TicketHistory
        {
            TicketId = ticketId,
            Type = type,
            Value = value,
            PreviousValue = previousValue,
            Date = DateTime.Now
        };
        _context.TicketHistories.Add(history);
    }

    /// <summary>
    /// チケットの履歴一覧を取得
    /// </summary>
    [HttpGet("{id}/history")]
    public async Task<ActionResult<List<TicketHistory>>> GetHistory(string id)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        var histories = await _context.TicketHistories
            .Where(h => h.TicketId == id)
            .OrderByDescending(h => h.Date)
            .ThenBy(h => h.Type)
            .ToListAsync();
        
        return Ok(histories);
    }

    /// <summary>
    /// チケットをアーカイブに移動（ソフトデリート）
    /// アーカイブした場合はアーカイブされたチケットデータを返す
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        // アーカイブ済みの場合は完全削除
        if (ticket.IsArchived)
        {
            _context.Tickets.Remove(ticket);
            await _context.SaveChangesAsync();
            return NoContent();
        }
        else
        {
            // 初回削除の場合はアーカイブに移動
            ticket.IsArchived = true;
            ticket.Column = "archive";
            ticket.Position = 0;
            await _context.SaveChangesAsync();
            // アーカイブされたチケットデータを返す（フロントエンドで再描画用）
            return Ok(ticket);
        }
    }

    /// <summary>
    /// チケットをアーカイブから復帰
    /// </summary>
    [HttpPatch("{id}/restore")]
    public async Task<IActionResult> Restore(string id)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        ticket.IsArchived = false;
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// カラムを変更（Positionも更新可能）
    /// </summary>
    [HttpPatch("{id}/column")]
    public async Task<IActionResult> UpdateColumn(string id, [FromBody] ColumnUpdateDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        var oldColumn = ticket.Column;
        var newColumn = dto.Column;
        ticket.Column = newColumn;

        // カラム移動履歴を記録（元と先が異なる場合）
        if (oldColumn != newColumn)
        {
            await RecordHistory(id, "column", newColumn, oldColumn);
        }

        if (dto.InsertIndex.HasValue)
            {
                // インデックスベースの中間値計算
                int insertIdx = dto.InsertIndex.Value;
                
                // 移動中のチケットを除くカラム内のチケットをPosition順に取得
                var ordered = await _context.Tickets
                    .Where(t => t.Column == newColumn && t.TicketId != id)
                    .OrderBy(t => t.Position)
                    .ToListAsync();
                
                double newPos;
                
                // 挿入インデックスの範囲チェック
                if (insertIdx <= 0)
                {
                    // 先頭に挿入：最初の要素より小さい値を設定
                    newPos = ordered.Count > 0 ? ordered[0].Position - 1.0 : 0.0;
                }
                else if (insertIdx >= ordered.Count)
                {
                    // 末尾に挿入
                    newPos = ordered.Count > 0 ? ordered[ordered.Count - 1].Position + 1.0 : 0.0;
                }
                else
                {
                    // 中間に挿入：前後のPositionの平均
                    newPos = (ordered[insertIdx - 1].Position + ordered[insertIdx].Position) / 2.0;
                }
                
                // 衝突検出（差が0.001未満の場合）
                var hasConflict = await _context.Tickets
                    .Where(t => t.Column == newColumn && t.TicketId != id)
                    .AnyAsync(t => Math.Abs(t.Position - newPos) < 0.001);
                
                if (hasConflict)
                {
                    // 精度が不足している場合は再編号してから再計算
                    await RepositionColumnDouble(newColumn, id);
                    ordered = await _context.Tickets
                        .Where(t => t.Column == newColumn && t.TicketId != id)
                        .OrderBy(t => t.Position)
                        .ToListAsync();
                    
                    if (insertIdx <= 0)
                    {
                        newPos = ordered.Count > 0 ? ordered[0].Position - 1.0 : 0.0;
                    }
                    else if (insertIdx >= ordered.Count)
                    {
                        newPos = ordered.Count > 0 ? ordered[ordered.Count - 1].Position + 1.0 : 0.0;
                    }
                    else
                    {
                        newPos = (ordered[insertIdx - 1].Position + ordered[insertIdx].Position) / 2.0;
                    }
                }
                
                ticket.Position = newPos;
                
                // 旧カラムのPositionを再編号（カラム移動した場合）
                // 移動中のチケットは除外する（EF Core Change Trackerが元のColumn値を使用するため）
                if (oldColumn != newColumn)
                {
                    await RepositionColumnDouble(oldColumn, id);
                }
            }
            else
            {
                // InsertIndex未指定の場合は、新カラムの末尾に追加
                var maxPos = await _context.Tickets
                    .Where(t => t.Column == dto.Column && t.TicketId != id)
                    .MaxAsync(t => (double?)t.Position) ?? -1.0;
                ticket.Position = maxPos + 1.0;

                if (oldColumn != dto.Column)
                {
                    await RepositionColumnDouble(oldColumn, id);
                }
            }
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// 進捗を更新
    /// </summary>
    [HttpPatch("{id}/progress")]
    public async Task<IActionResult> UpdateProgress(string id, [FromBody] ProgressUpdateDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        var oldProgress = ticket.Progress;
        ticket.Progress = Math.Max(0, Math.Min(100, dto.Progress));
        
        // 進捗変更履歴を記録（値が異なる場合）
        if (oldProgress != ticket.Progress)
        {
            await RecordHistory(id, "progress", ticket.Progress.ToString(), oldProgress.ToString());
        }
        
        await _context.SaveChangesAsync();
        return NoContent();
    }

    /// <summary>
    /// 子タスクの完了状態を更新
    /// </summary>
    [HttpPatch("{id}/child-task/{index}")]
    public async Task<ActionResult<Ticket>> UpdateChildTask(string id, int index, [FromBody] ChildTaskUpdateDto dto)
    {
        var ticket = await _context.Tickets.FindAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        var childTasks = ticket.ChildTasks;
        if (index < 0 || index >= childTasks.Count)
            return BadRequest(new { error = "Child task index out of range" });

        childTasks[index].Done = dto.Done;
        ticket.ChildTasks = childTasks;
        await _context.SaveChangesAsync();

        return Ok(ticket);
    }

    /// <summary>
    /// ラベルサジェストを取得（設定 + チケットに割り当てられているラベル）
    /// </summary>
    [HttpGet("labels/suggest")]
    public async Task<ActionResult<List<LabelSuggestDto>>> GetLabelsSuggest()
    {
        // 設定からラベル情報を取得
        var setting = await _context.Settings.FirstOrDefaultAsync();
        var labelMap = new Dictionary<string, string>();
        
        if (setting?.Labels != null)
        {
            foreach (var lc in setting.Labels.OrderBy(l => l.Name))
            {
                labelMap[lc.Name] = lc.Color;
            }
        }

        // チケットから使用されているラベルを取得（設定にないものを追加）
        var tickets = await _context.Tickets.Where(t => t.LabelsJson != null && t.LabelsJson.Length > 2).ToListAsync();
        foreach (var ticket in tickets)
            {
                var labels = System.Text.Json.JsonSerializer.Deserialize<List<string>>(ticket.LabelsJson);
                if (labels != null)
                {
                    foreach (var label in labels)
                    {
                        if (!labelMap.ContainsKey(label))
                        {
                            labelMap[label] = "#808080"; // 設定にないラベルはデフォルト色
                        }
                    }
                }
            }

        var result = labelMap.OrderBy(kvp => kvp.Key).Select(kvp => new LabelSuggestDto
        {
            Name = kvp.Key,
            Color = kvp.Value
        }).ToList();

        return Ok(result);
    }

    /// <summary>
    /// 担当者サジェストを取得（設定 + チケットに割り当てられている担当者）
    /// </summary>
    [HttpGet("assignees/suggest")]
    public async Task<ActionResult<List<string>>> GetAssigneesSuggest()
    {
        var assigneeSet = new HashSet<string>();

        // 設定から担当者情報を取得
        var setting = await _context.Settings.FirstOrDefaultAsync();
        if (setting?.Users != null)
        {
            foreach (var user in setting.Users)
            {
                assigneeSet.Add(user);
            }
        }

        // チケットから使用されている担当者を取得（設定にないものを追加）
        var tickets = await _context.Tickets.Where(t => t.AssigneesJson != null && t.AssigneesJson.Length > 2).ToListAsync();
        foreach (var ticket in tickets)
            {
                var assignees = System.Text.Json.JsonSerializer.Deserialize<List<string>>(ticket.AssigneesJson);
                if (assignees != null)
                {
                    foreach (var assignee in assignees)
                    {
                        assigneeSet.Add(assignee);
                    }
                }
            }

        return Ok(assigneeSet.OrderBy(a => a).ToList());
    }

    /// <summary>
    /// カラム内のPositionを0.0, 1.0, 2.0, ... に再編号（中間値方式のフォールバック）
    /// </summary>
    private async Task RepositionColumnDouble(string column, string? excludeTicketId = null)
    {
        var tickets = await _context.Tickets
            .Where(t => t.Column == column && (excludeTicketId == null || t.TicketId != excludeTicketId))
            .OrderBy(t => t.Position)
            .ToListAsync();

        for (int i = 0; i < tickets.Count; i++)
        {
            tickets[i].Position = i;
        }
    }
}

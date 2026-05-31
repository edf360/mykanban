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
        var tickets = await _context.Tickets.Where(t => !t.IsArchived).OrderBy(t => t.Column).ThenBy(t => t.Position).ToListAsync();
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

        // 同じカラム内の最大Positionを取得
        var maxPosition = await _context.Tickets
            .Where(t => t.Column == ticket.Column)
            .MaxAsync(t => (int?)t.Position) ?? -1;
        ticket.Position = maxPosition + 1;

        _context.Tickets.Add(ticket);
        
        // 作成履歴を記録
        var today = DateTime.Now.Date;
        var history = new TicketHistory
        {
            TicketId = ticket.TicketId,
            Type = "created",
            Value = null,
            PreviousValue = null,
            Date = today
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

        await _context.SaveChangesAsync();
        return Ok(ticket);
    }

    /// <summary>
    /// 指定されたタイプの履歴をその日の最新値として保存（既に存在すれば更新）
    /// </summary>
    private async Task RecordHistory(string ticketId, string type, string? value, string? previousValue)
    {
        var today = DateTime.Now.Date;
        var existing = await _context.TicketHistories
            .FirstOrDefaultAsync(h => h.TicketId == ticketId && h.Type == type && h.Date.Date == today);
        
        if (existing != null)
        {
            // 同じ日の同じタイプが既に存在すれば更新
            existing.Value = value;
            existing.PreviousValue = previousValue;
        }
        else
        {
            // 新規作成
            var history = new TicketHistory
            {
                TicketId = ticketId,
                Type = type,
                Value = value,
                PreviousValue = previousValue,
                Date = today
            };
            _context.TicketHistories.Add(history);
        }
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

        if (dto.Position.HasValue)
        {
            // 旧カラムのPositionを再編号
            if (oldColumn != dto.Column)
            {
                await RepositionColumn(oldColumn);
            }

            // 新カラムで指定位置に挿入（その後のPositionをシフト）
            ticket.Position = dto.Position.Value;
            await ShiftPositions(dto.Column, dto.Position.Value);
        }
        else
        {
            // Position未指定の場合は、新カラムの末尾に追加
            var maxPos = await _context.Tickets
                .Where(t => t.Column == dto.Column && t.TicketId != id)
                .MaxAsync(t => (int?)t.Position) ?? -1;
            ticket.Position = maxPos + 1;

            if (oldColumn != dto.Column)
            {
                await RepositionColumn(oldColumn);
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
    /// カラム内のPositionを0から連続に再編号
    /// </summary>
    private async Task RepositionColumn(string column)
    {
        var tickets = await _context.Tickets
            .Where(t => t.Column == column)
            .OrderBy(t => t.Position)
            .ToListAsync();

        for (int i = 0; i < tickets.Count; i++)
        {
            tickets[i].Position = i;
        }
    }

    /// <summary>
    /// 指定位置以降のPositionを+1シフト
    /// </summary>
    private async Task ShiftPositions(string column, int position)
    {
        var toShift = await _context.Tickets
            .Where(t => t.Column == column && t.Position >= position)
            .ToListAsync();

        foreach (var t in toShift)
        {
            t.Position++;
        }
    }
}

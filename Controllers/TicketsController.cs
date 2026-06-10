using KanbanServer.Models;
using KanbanServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace KanbanServer.Controllers;

[ApiController]
[Route("api/tickets")]
public class TicketsController : ControllerBase
{
    private readonly TicketService _ticketService;

    public TicketsController(TicketService ticketService)
    {
        _ticketService = ticketService;
    }

    /// <summary>
    /// チケット一覧を取得（Position順にソート）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<Ticket>>> GetAll()
    {
        var tickets = await _ticketService.GetAllAsync();
        return Ok(tickets);
    }

    /// <summary>
    /// 新規チケットを作成
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Ticket>> Create([FromBody] TicketDto? dto)
    {
        if (dto == null)
            return BadRequest(new { error = "Request body is required" });
        try
        {
            var ticket = await _ticketService.CreateAsync(dto);
            return CreatedAtAction(nameof(GetAll), new { id = ticket.TicketId }, ticket);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// チケットを完全に更新
    /// </summary>
    [HttpPut("{id}")]
    public async Task<ActionResult<Ticket>> Update(string id, [FromBody] TicketDto? dto)
    {
        if (dto == null)
            return BadRequest(new { error = "Request body is required" });
        try
        {
            var ticket = await _ticketService.UpdateAsync(id, dto);
            if (ticket == null)
                return NotFound(new { error = "Ticket not found" });
            return Ok(ticket);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// チケットの履歴一覧を取得
    /// </summary>
    [HttpGet("{id}/history")]
    public async Task<ActionResult<List<TicketHistory>>> GetHistory(string id)
    {
        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });
        var histories = await _ticketService.GetHistoryAsync(id);
        return Ok(histories);
    }

    /// <summary>
    /// チケットを削除
    /// アーカイブ済みの場合は完全削除（ハードデリート）
    /// それ以外はアーカイブ移動（ソフトデリート）
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(string id)
    {
        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        if (ticket.IsArchived)
        {
            // アーカイブ済み → 完全削除
            var result = await _ticketService.DeleteAsync(id);
            if (!result)
                return NotFound(new { error = "Ticket not found" });
            return NoContent();
        }
        else
        {
            // 未アーカイブ → アーカイブ移動
            var result = await _ticketService.ArchiveAsync(id);
            if (result == null)
                return NotFound(new { error = "Ticket not found" });
            return Ok(result);
        }
    }

    /// <summary>
    /// チケットをアーカイブから復帰
    /// </summary>
    [HttpPatch("{id}/restore")]
    public async Task<ActionResult<Ticket>> Restore(string id)
    {
        var ticket = await _ticketService.RestoreAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });
        return Ok(ticket);
    }

    /// <summary>
    /// カラムを変更（Positionも更新可能）
    /// </summary>
    [HttpPatch("{id}/column")]
    public async Task<IActionResult> UpdateColumn(string id, [FromBody] ColumnUpdateDto? dto)
    {
        if (dto == null)
            return BadRequest(new { error = "Request body is required" });
        var success = await _ticketService.UpdateColumnAsync(id, dto);
        if (!success)
            return NotFound(new { error = "Ticket not found" });
        return NoContent();
    }

    /// <summary>
    /// 進捗を更新
    /// </summary>
    [HttpPatch("{id}/progress")]
    public async Task<IActionResult> UpdateProgress(string id, [FromBody] ProgressUpdateDto? dto)
    {
        if (dto == null)
            return BadRequest(new { error = "Request body is required" });
        var success = await _ticketService.UpdateProgressAsync(id, dto);
        if (!success)
            return NotFound(new { error = "Ticket not found" });
        return NoContent();
    }

    /// <summary>
    /// 子タスクの完了状態を更新（IDベース）
    /// </summary>
    [HttpPatch("{id}/child-task/{childId}")]
    public async Task<ActionResult<Ticket>> UpdateChildTask(string id, string childId, [FromBody] ChildTaskUpdateDto? dto)
    {
        if (dto == null)
            return BadRequest(new { error = "Request body is required" });
        var ticket = await _ticketService.UpdateChildTaskAsync(id, childId, dto);
        if (ticket == null)
            return NotFound(new { error = "Ticket or child task not found" });
        return Ok(ticket);
    }

    /// <summary>
    /// ラベルサジェストを取得（設定 + チケットに割り当てられているラベル）
    /// </summary>
    [HttpGet("labels/suggest")]
    public async Task<ActionResult<List<LabelSuggestDto>>> GetLabelsSuggest()
    {
        var result = await _ticketService.GetLabelsSuggestAsync();
        return Ok(result);
    }

    /// <summary>
    /// 担当者サジェストを取得（設定 + チケットに割り当てられている担当者）
    /// </summary>
    [HttpGet("assignees/suggest")]
    public async Task<ActionResult<List<string>>> GetAssigneesSuggest()
    {
        var result = await _ticketService.GetAssigneesSuggestAsync();
        return Ok(result);
    }
}

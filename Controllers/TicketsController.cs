using KanbanServer.Hubs;
using KanbanServer.Models;
using KanbanServer.Services;
using KanbanServer.Data;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace KanbanServer.Controllers;

[ApiController]
[Route("api/tickets")]
public class TicketsController : ControllerBase
{
    private readonly TicketService _ticketService;
    private readonly KanbanDbContext _dbContext;
    private readonly IWebHostEnvironment _env;
    private readonly IHubContext<TicketHub> _hubContext;

    public TicketsController(TicketService ticketService, KanbanDbContext dbContext, IWebHostEnvironment env, IHubContext<TicketHub> hubContext)
    {
        _ticketService = ticketService;
        _dbContext = dbContext;
        _env = env;
        _hubContext = hubContext;
    }

    /// <summary>
    /// 現在ログイン中のユーザー名を取得
    /// </summary>
    private string? GetUsername()
    {
        if (HttpContext is null || HttpContext.Items.Count == 0)
        {
            return null;
        }
        return HttpContext.Items["Username"] as string;
    }

    /// <summary>
    /// チケット変更を全クライアントに通知
    /// </summary>
    private async Task NotifyTicketChanged()
    {
        await _hubContext.Clients.All.SendAsync("TicketChanged");
    }

    /// <summary>
    /// チケット一覧を取得（Position順にソート）
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<Ticket>>> GetAll()
    {
        // キャッシュ無効化ヘッダーを追加（SignalRによるリアルタイム更新のため）
        if (Response != null)
        {
            Response.Headers.Append("Cache-Control", "no-cache, no-store, must-revalidate");
            Response.Headers.Append("Pragma", "no-cache");
            Response.Headers.Append("Expires", "0");
        }
        
        try
        {
            var tickets = await _ticketService.GetAllAsync();
            return Ok(tickets);
        }
        catch (Exception ex)
        {
            if (_env.IsDevelopment())
            {
                return StatusCode(500, new { error = "Failed to retrieve tickets: " + ex.Message });
            }
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// 新規チケットを作成
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<Ticket>> Create([FromBody] TicketDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required" });
        try
        {
            var ticket = await _ticketService.CreateAsync(dto, GetUsername());
            await NotifyTicketChanged();
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
        if (dto is null)
            return BadRequest(new { error = "Request body is required" });
        try
        {
            var ticket = await _ticketService.UpdateAsync(id, dto, GetUsername());
            if (ticket == null)
                return NotFound(new { error = "Ticket not found" });
            await NotifyTicketChanged();
            return Ok(ticket);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            if (_env.IsDevelopment())
            {
                return StatusCode(500, new { error = "Internal server error", details = ex.Message, stackTrace = ex.StackTrace });
            }
            return StatusCode(500, new { error = "Internal server error" });
        }
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
            // アーカイブ済み → ソフト削除
            var result = await _ticketService.DeleteAsync(id, GetUsername());
            if (!result)
                return NotFound(new { error = "Ticket not found" });
            await NotifyTicketChanged();
            return NoContent();
        }
        else
        {
            // 未アーカイブ → アーカイブ移動
            var result = await _ticketService.ArchiveAsync(id, GetUsername());
            if (result == null)
                return NotFound(new { error = "Ticket not found" });
            await NotifyTicketChanged();
            return Ok(result);
        }
    }

    /// <summary>
    /// チケットをアーカイブから復帰
    /// </summary>
    [HttpPatch("{id}/restore")]
    public async Task<ActionResult<Ticket>> Restore(string id)
    {
        var ticket = await _ticketService.RestoreAsync(id, GetUsername());
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });
        await NotifyTicketChanged();
        return Ok(ticket);
    }

    /// <summary>
    /// カラムを変更（Positionも更新可能）
    /// </summary>
    [HttpPatch("{id}/column")]
    public async Task<IActionResult> UpdateColumn(string id, [FromBody] ColumnUpdateDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required" });
        
        // チケット存在チェックを先に実行
        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });
        
        var success = await _ticketService.UpdateColumnAsync(id, dto, GetUsername());
        if (!success)
            return BadRequest(new { error = "Failed to update column" });
        await NotifyTicketChanged();
        return NoContent();
    }

    /// <summary>
    /// 子タスクの完了状態を更新（IDベース）
    /// </summary>
    [HttpPatch("{id}/child-task/{childId}")]
    public async Task<ActionResult<Ticket>> UpdateChildTask(string id, string childId, [FromBody] ChildTaskUpdateDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required" });
        var ticket = await _ticketService.UpdateChildTaskAsync(id, childId, dto, GetUsername());
        if (ticket == null)
            return NotFound(new { error = "Ticket or child task not found" });
        await NotifyTicketChanged();
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

    // ===== 実績（TicketActual）CRUD =====

    /// <summary>
    /// 複数のチケットの実績をバッチで取得
    /// </summary>
    [HttpGet("actuals/batch")]
    public async Task<ActionResult<List<TicketActual>>> GetActualsBatch([FromQuery] List<string> ticketIds)
    {
        if (ticketIds == null || ticketIds.Count == 0)
            return Ok(new List<TicketActual>());
        var actuals = await _dbContext.TicketActuals
            .Where(a => ticketIds.Contains(a.TicketId))
            .ToListAsync();
        return Ok(actuals);
    }

    /// <summary>
    /// チケットの実績一覧を取得（日付降順）
    /// </summary>
    [HttpGet("{id}/actuals")]
    public async Task<ActionResult<List<TicketActual>>> GetActuals(string id)
    {
        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });
        var actuals = await _dbContext.TicketActuals
            .Where(a => a.TicketId == id)
            .OrderByDescending(a => a.Date)
            .ToListAsync();
        return Ok(actuals);
    }

    /// <summary>
    /// 実績を登録または更新（日付ベース）
    /// </summary>
    [HttpPost("{id}/actuals")]
    public async Task<ActionResult<TicketActual>> CreateOrUpdateActual(string id, [FromBody] ActualDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required" });
        if (dto.Hours < 0)
            return BadRequest(new { error = "Hours must be non-negative" });
        if (dto.Hours > 24)
            return BadRequest(new { error = "Hours must be 24 or less" });

        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        // ChildTaskIdを優先、ChildTaskIndexは後方互換
#pragma warning disable CS0618 // 'ActualDto.ChildTaskIndex' is obsolete
        string? childTaskId = dto.ChildTaskId;
        int? childTaskIndex = childTaskId == null ? dto.ChildTaskIndex : null;

        // 既存の実績を確認（ChildTaskId優先、次にChildTaskIndex）
        TicketActual? existing;
        if (childTaskId != null)
        {
            existing = await _dbContext.TicketActuals
                .FirstOrDefaultAsync(a => a.TicketId == id && a.Date.Date == dto.Date.Date && a.ChildTaskId == childTaskId);
        }
        else
        {
#pragma warning disable CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
            existing = await _dbContext.TicketActuals
                .FirstOrDefaultAsync(a => a.TicketId == id && a.Date.Date == dto.Date.Date && a.ChildTaskIndex == childTaskIndex);
#pragma warning restore CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
        }

        // ProgressRateを0-100にクランプ
        int? clampedProgress = dto.ProgressRate;
        if (clampedProgress.HasValue)
        {
            clampedProgress = Math.Clamp(clampedProgress.Value, 0, 100);
        }

        TicketActual actualEntity;
        if (existing != null)
        {
            // 更新
            existing.Hours = dto.Hours;
            existing.ProgressRate = clampedProgress;
            existing.UpdatedAt = DateTime.Now;
            actualEntity = existing;
        }
        else
        {
            // 新規作成
#pragma warning disable CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
            actualEntity = new TicketActual
            {
                TicketId = id,
                Date = dto.Date.Date,
                Hours = dto.Hours,
                ProgressRate = clampedProgress,
                ChildTaskIndex = childTaskIndex,
                ChildTaskId = childTaskId,
                CreatedAt = DateTime.Now
            };
#pragma warning restore CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
            _dbContext.TicketActuals.Add(actualEntity);
        }

        await _dbContext.SaveChangesAsync();
        await NotifyTicketChanged();
        
        // 常にTicketActualエンティティを返す（レスポンス形式を統一）
        return Ok(actualEntity);
    }

    /// <summary>
    /// 実績を更新
    /// </summary>
    [HttpPut("{id}/actuals/{date}")]
    public async Task<ActionResult<TicketActual>> UpdateActual(string id, string date, [FromQuery] int? childTaskIndex, [FromQuery] string? childTaskId, [FromBody] ActualDto? dto)
    {
        if (dto is null)
            return BadRequest(new { error = "Request body is required" });
        if (dto.Hours < 0)
            return BadRequest(new { error = "Hours must be non-negative" });
        if (dto.Hours > 24)
            return BadRequest(new { error = "Hours must be 24 or less" });

        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        // ChildTaskIdを優先
#pragma warning disable CS0618 // 'ActualDto.ChildTaskIndex' is obsolete
        string? targetChildTaskId = childTaskId ?? dto.ChildTaskId;
        int? targetChildTaskIndex = targetChildTaskId == null ? childTaskIndex ?? dto.ChildTaskIndex : null;

        DateTime targetDate;
        if (!DateTime.TryParseExact(date, "yyyy-MM-dd", null, System.Globalization.DateTimeStyles.None, out targetDate))
        {
            return BadRequest(new { error = "Invalid date format. Use yyyy-MM-dd" });
        }

        // ChildTaskId優先で検索
        TicketActual? actual;
        if (targetChildTaskId != null)
        {
            actual = await _dbContext.TicketActuals
                .FirstOrDefaultAsync(a => a.TicketId == id && a.Date.Date == targetDate.Date && a.ChildTaskId == targetChildTaskId);
        }
        else
        {
#pragma warning disable CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
            actual = await _dbContext.TicketActuals
                .FirstOrDefaultAsync(a => a.TicketId == id && a.Date.Date == targetDate.Date && a.ChildTaskIndex == targetChildTaskIndex);
#pragma warning restore CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
        }
        if (actual == null)
            return NotFound(new { error = "Actual not found" });

        actual.Hours = dto.Hours;
        // ProgressRateを0-100にクランプ
        if (dto.ProgressRate.HasValue)
        {
            actual.ProgressRate = Math.Clamp(dto.ProgressRate.Value, 0, 100);
        }
        else
        {
            actual.ProgressRate = dto.ProgressRate;
        }
        actual.UpdatedAt = DateTime.Now;
        await _dbContext.SaveChangesAsync();
        await NotifyTicketChanged();
        return Ok(actual);
    }

    /// <summary>
    /// 実績を削除
    /// </summary>
    [HttpDelete("{id}/actuals/{date}")]
    public async Task<IActionResult> DeleteActual(string id, string date, [FromQuery] int? childTaskIndex = null, [FromQuery] string? childTaskId = null)
    {
        var ticket = await _ticketService.GetAsync(id);
        if (ticket == null)
            return NotFound(new { error = "Ticket not found" });

        DateTime targetDate;
        if (!DateTime.TryParseExact(date, "yyyy-MM-dd", null, System.Globalization.DateTimeStyles.None, out targetDate))
        {
            return BadRequest(new { error = "Invalid date format. Use yyyy-MM-dd" });
        }

        // ChildTaskId優先で検索
        TicketActual? actual;
        if (childTaskId != null)
        {
            actual = await _dbContext.TicketActuals
                .FirstOrDefaultAsync(a => a.TicketId == id && a.Date.Date == targetDate.Date && a.ChildTaskId == childTaskId);
        }
        else
        {
#pragma warning disable CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
            actual = await _dbContext.TicketActuals
                .FirstOrDefaultAsync(a => a.TicketId == id && a.Date.Date == targetDate.Date && a.ChildTaskIndex == childTaskIndex);
#pragma warning restore CS0618 // 'TicketActual.ChildTaskIndex' is obsolete
        }
        if (actual == null)
            return NotFound(new { error = "Actual not found" });

        _dbContext.TicketActuals.Remove(actual);
        await _dbContext.SaveChangesAsync();
        await NotifyTicketChanged();
        return NoContent();
    }
}

/// <summary>
/// 実績登録用のDTO
/// </summary>
public class ActualDto
{
    public DateTime Date { get; set; }
    public double Hours { get; set; }
    public int? ProgressRate { get; set; }
    
    /// <summary>
    /// 子タスクインデックス（旧方式、非推奨）
    /// </summary>
    [Obsolete("Use ChildTaskId instead")]
    public int? ChildTaskIndex { get; set; }
    
    /// <summary>
    /// 子タスクID（null=親チケット自身）
    /// </summary>
    public string? ChildTaskId { get; set; }
}

using Microsoft.AspNetCore.Mvc;

namespace KanbanServer.Controllers;

/// <summary>
/// サーバーログの取得用エンドポイント
/// </summary>
[ApiController]
[Route("api/logs")]
public class LogsController : ControllerBase
{
    /// <summary>
    /// 最近のサーバーログを取得（最新1000行）
    /// 認証必要（一般ユーザーでもOK）
    /// </summary>
    [HttpGet]
    public IActionResult GetServerLogs()
    {
        var logFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs", "kanban.log");

        if (!System.IO.File.Exists(logFilePath))
        {
            return Ok(Array.Empty<string>());
        }

        try
        {
            var allLines = System.IO.File.ReadAllLines(logFilePath);
            var recentLines = allLines.Length > 1000
                ? allLines[(allLines.Length - 1000)..]
                : allLines;

            return Ok(recentLines);
        }
        catch (IOException ex)
        {
            return StatusCode(500, new { error = "Failed to read log file: " + ex.Message });
        }
    }
}

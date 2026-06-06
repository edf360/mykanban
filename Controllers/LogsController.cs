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
            // 末尾から1000行のみを読み込む（メモリ効率改善）
            var recentLines = ReadTailLines(logFilePath, 1000);
            return Ok(recentLines);
        }
        catch (IOException ex)
        {
            return StatusCode(500, new { error = "Failed to read log file: " + ex.Message });
        }
        catch (UnauthorizedAccessException ex)
        {
            return StatusCode(403, new { error = "Access denied to log file: " + ex.Message });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { error = "Failed to read log file: " + ex.Message });
        }
    }

    private static string[] ReadTailLines(string path, int lineCount)
    {
        const int bufferSize = 1024;
        var lines = new System.Collections.Generic.List<string>();
        using var fs = new System.IO.FileStream(path, System.IO.FileMode.Open, System.IO.FileAccess.Read, System.IO.FileShare.ReadWrite);
        using var reader = new System.IO.StreamReader(fs, System.Text.Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize, leaveOpen: true);
        
        // ファイルサイズが小さい場合は全行読み込み
        if (fs.Length < bufferSize * 2)
        {
            var allLines = System.IO.File.ReadAllLines(path);
            return allLines;
        }

        // 末尾からブロック単位で読み込み
        var chunkSize = bufferSize;
        var maxAttempts = (int)((fs.Length + chunkSize - 1) / chunkSize);
        
        for (int offset = 1; offset <= maxAttempts && lines.Count < lineCount; offset++)
        {
            var start = Math.Max(0, (int)fs.Length - chunkSize * offset);
            var length = (int)fs.Length - start;
            var buffer = new byte[length];
            fs.Seek(start, System.IO.SeekOrigin.Begin);
            fs.ReadExactly(buffer, 0, length);
            
            var text = System.Text.Encoding.UTF8.GetString(buffer);
            var chunkLines = text.Split('\n');
            
            // 先頭から逆順に追加（重複行を除外）
            for (int i = chunkLines.Length - 1; i >= 0 && lines.Count < lineCount; i--)
            {
                var line = chunkLines[i].TrimEnd('\r');
                if (!string.IsNullOrEmpty(line) && !lines.Contains(line))
                {
                    lines.Add(line);
                }
            }
        }

        lines.Reverse();
        return lines.ToArray();
    }
}

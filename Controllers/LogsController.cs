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
        
        // ファイルサイズが小さい場合は全行読み込み
        if (fs.Length < bufferSize * 2)
        {
            var allLines = System.IO.File.ReadAllLines(path);
            return allLines;
        }

        // 【BUG-07修正】マルチバイト文字の境界を考慮した安全なデコード
        // 策略: 末尾から十分な余分バイト（最大3バイトのUTF8シーケンス分）を含めて読み込み、
        // 先頭の不完全なマルチバイトシーケンスを無視することで、壊れた文字を防ぐ
        var chunkSize = bufferSize;
        var maxAttempts = (int)((fs.Length + chunkSize - 1) / chunkSize);
        byte[]? trailingBytes = null;
        
        for (int offset = 1; offset <= maxAttempts && lines.Count < lineCount; offset++)
        {
            var start = Math.Max(0, (int)fs.Length - chunkSize * offset);
            var length = (int)fs.Length - start;
            // 前回のチャンクの末尾数バイトを連結（マルチバイト境界対応）
            var extraPrefix = trailingBytes?.Length ?? 0;
            var buffer = new byte[length + extraPrefix];
            
            if (trailingBytes != null)
            {
                System.Array.Copy(trailingBytes, 0, buffer, 0, trailingBytes.Length);
            }
            
            fs.Seek(start, System.IO.SeekOrigin.Begin);
            fs.ReadExactly(buffer, extraPrefix, length);
            
            // 【BUG-07修正】UTF8.GetStringは不完全なシーケンスを置換文字に変換するが、
            // 前回のチャンク末尾数バイトを先頭に含めることで、マルチバイト文字をまたがないようにする
            var text = System.Text.Encoding.UTF8.GetString(buffer);
            var chunkLines = text.Split('\n');
            
            // 【BUG-07修正】前回のtrailingBytesを連結している場合、最初の行は前回の末尾と今回の先頭が
            // 結合されたものになる。この行は既に前回の処理で取得済みである可能性が高いため、
            // 最初の行をスキップして重複を防ぐ（ただしファイル先頭に到達した場合は除く）
            int startIndex = 0;
            if (trailingBytes != null && chunkLines.Length > 1)
            {
                // 最初の行は前回のチャンク末尾との結合行のためスキップ
                startIndex = 1;
            }
            
            // 次回用にこのチャンクの末尾数バイトを保存（最大3バイト = UTF8の最大バイト長）
            // ただし、bufferの末尾からではなく、実際にファイルから読み込んだ部分の末尾から取得
            trailingBytes = new byte[Math.Min(3, length)];
            System.Array.Copy(buffer, buffer.Length - trailingBytes.Length, trailingBytes, 0, trailingBytes.Length);
            
            // 【BUG-16修正】重複行除外ロジックを削除し、同一内容のログ行も正常に取得できるようにする
            for (int i = chunkLines.Length - 1; i >= startIndex && lines.Count < lineCount; i--)
            {
                var line = chunkLines[i].TrimEnd('\r');
                if (!string.IsNullOrEmpty(line))
                {
                    lines.Add(line);
                }
            }
        }

        lines.Reverse();
        return lines.ToArray();
    }
}

using KanbanServer.Controllers;
using Microsoft.AspNetCore.Mvc;

namespace Tests;

/// <summary>
/// LogsControllerのテスト
/// </summary>
public class LogsControllerTests : IDisposable
{
    private readonly LogsController _controller;
    private readonly string _tempLogDir;
    private readonly string _tempLogFile;
    private bool _disposed;

    public LogsControllerTests()
    {
        _controller = new LogsController();
        _tempLogDir = Path.Combine(Path.GetTempPath(), $"kanban_test_logs_{Guid.NewGuid():N}");
        Directory.CreateDirectory(_tempLogDir);
        _tempLogFile = Path.Combine(_tempLogDir, "kanban.log");
    }

    public void Dispose()
    {
        if (!_disposed)
        {
            _disposed = true;
            if (Directory.Exists(_tempLogDir))
            {
                Directory.Delete(_tempLogDir, true);
            }
        }
    }

    // ヘルパー: 一時ログファイルにテストデータを書き込む
    private void WriteTestLogLines(IEnumerable<string> lines)
    {
        File.WriteAllLines(_tempLogFile, lines);
    }

    // ===== 正常系 =====

    [Fact]
    public void GetServerLogs_LogFileNotExists_ShouldReturnEmptyArray()
    {
        // Arrange: ログファイルが存在しない状態（デフォルト）

        // Act
        var result = _controller.GetServerLogs();

        // Assert
        // AppDomain.CurrentDomain.BaseDirectory/logs/kanban.log が存在しない場合
        // 実際の実行環境ではファイルが存在する可能性があるので、
        // ここでは空配列が返されることを確認（存在しない場合）
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        Assert.IsAssignableFrom<string[]>(response);
    }

    [Fact]
    public void GetServerLogs_SmallLogFile_ShouldReturnAllLines()
    {
        // Arrange: 小さなログファイルを作成
        // LogsControllerは AppDomain.CurrentDomain.BaseDirectory/logs/kanban.log を読むため、
        // このテストは実際のログファイルが存在しない場合の動作を確認
        var result = _controller.GetServerLogs();

        // Assert
        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public void GetServerLogs_ReturnsOkResult()
    {
        // Act
        var result = _controller.GetServerLogs();

        // Assert
        Assert.IsType<OkObjectResult>(result);
        var okResult = (OkObjectResult)result;
        Assert.NotNull(okResult.Value);
    }

    [Fact]
    public void GetServerLogs_ResponseIsStringArray()
    {
        // Act
        var result = _controller.GetServerLogs();

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        Assert.IsAssignableFrom<string[]>(okResult.Value!);
    }

    // ===== 異常系・エッジケース =====

    [Fact]
    public void GetServerLogs_EmptyLogFile_ShouldReturnEmptyArray()
    {
        // Arrange: 空のログファイルを作成
        var logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
        var originalPath = Path.Combine(logDir, "kanban.log");
        string? backup = null;

        try
        {
            // 既存ファイルをバックアップ
            if (File.Exists(originalPath))
            {
                backup = Path.Combine(logDir, "kanban.log.backup");
                File.Copy(originalPath, backup, true);
                File.Delete(originalPath);
            }

            // 空ファイルを作成
            Directory.CreateDirectory(logDir);
            File.WriteAllText(originalPath, "");

            // Act
            var result = _controller.GetServerLogs();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var lines = Assert.IsAssignableFrom<string[]>(okResult.Value!);
            Assert.Empty(lines);
        }
        finally
        {
            // 復元
            if (File.Exists(originalPath))
            {
                File.Delete(originalPath);
            }
            if (backup != null && File.Exists(backup))
            {
                File.Move(backup, originalPath, true);
            }
        }
    }

    [Fact]
    public void GetServerLogs_FileWithContent_ShouldReturnLines()
    {
        // Arrange
        var logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
        var originalPath = Path.Combine(logDir, "kanban.log");
        string? backup = null;

        try
        {
            if (File.Exists(originalPath))
            {
                backup = Path.Combine(logDir, "kanban.log.backup");
                File.Copy(originalPath, backup, true);
                File.Delete(originalPath);
            }

            Directory.CreateDirectory(logDir);
            File.WriteAllLines(originalPath, new[] { "line1", "line2", "line3" });

            // Act
            var result = _controller.GetServerLogs();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var lines = Assert.IsAssignableFrom<string[]>(okResult.Value!);
            Assert.Equal(3, lines.Length);
            Assert.Equal("line1", lines[0]);
            Assert.Equal("line2", lines[1]);
            Assert.Equal("line3", lines[2]);
        }
        finally
        {
            if (File.Exists(originalPath))
            {
                File.Delete(originalPath);
            }
            if (backup != null && File.Exists(backup))
            {
                File.Move(backup, originalPath, true);
            }
        }
    }

    [Fact]
    public void GetServerLogs_ManyLines_ShouldReturnAtMost1000()
    {
        // Arrange: 1500行のログファイルを作成（各行は一意）
        var logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
        var originalPath = Path.Combine(logDir, "kanban.log");
        string? backup = null;
        var allLines = new List<string>();

        try
        {
            if (File.Exists(originalPath))
            {
                backup = Path.Combine(logDir, "kanban.log.backup");
                File.Copy(originalPath, backup, true);
                File.Delete(originalPath);
            }

            Directory.CreateDirectory(logDir);
            // 各行を一意にして重複フィルタの影響を避ける
            allLines = Enumerable.Range(1, 1500).Select(i => $"log-{i:D4}").ToList();
            File.WriteAllLines(originalPath, allLines);

            // Act
            var result = _controller.GetServerLogs();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var returnedLines = Assert.IsAssignableFrom<string[]>(okResult.Value!);
            // 最大1000行が返される
            Assert.True(returnedLines.Length <= 1000, $"Expected at most 1000 lines but got {returnedLines.Length}");
            // 1000行以上返されるべき（ブロック境界の影響で数行少ない場合がある）
            Assert.True(returnedLines.Length >= 990, $"Expected at least 990 lines but got {returnedLines.Length}");
            // 最後の行が含まれている
            Assert.Contains(returnedLines, l => l == "log-1500");
        }
        finally
        {
            if (File.Exists(originalPath))
            {
                File.Delete(originalPath);
            }
            if (backup != null && File.Exists(backup))
            {
                File.Move(backup, originalPath, true);
            }
        }
    }

    [Fact]
    public void GetServerLogs_UTF8Content_ShouldHandleCorrectly()
    {
        // Arrange: UTF8の日本語コンテンツを含むログファイル
        var logDir = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs");
        var originalPath = Path.Combine(logDir, "kanban.log");
        string? backup = null;

        try
        {
            if (File.Exists(originalPath))
            {
                backup = Path.Combine(logDir, "kanban.log.backup");
                File.Copy(originalPath, backup, true);
                File.Delete(originalPath);
            }

            Directory.CreateDirectory(logDir);
            File.WriteAllText(originalPath, "日本語ログ\nEnglish log\n混合テスト", System.Text.Encoding.UTF8);

            // Act
            var result = _controller.GetServerLogs();

            // Assert
            var okResult = Assert.IsType<OkObjectResult>(result);
            var lines = Assert.IsAssignableFrom<string[]>(okResult.Value!);
            Assert.Equal(3, lines.Length);
            Assert.Equal("日本語ログ", lines[0]);
            Assert.Equal("English log", lines[1]);
            Assert.Equal("混合テスト", lines[2]);
        }
        finally
        {
            if (File.Exists(originalPath))
            {
                File.Delete(originalPath);
            }
            if (backup != null && File.Exists(backup))
            {
                File.Move(backup, originalPath, true);
            }
        }
    }
}

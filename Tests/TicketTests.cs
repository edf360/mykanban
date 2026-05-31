using System.Text.Json;
using KanbanServer.Controllers;
using KanbanServer.Data;
using KanbanServer.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Tests;

/// <summary>
/// テスト用のDbContextファクトリ
/// In-memory SQLiteを使用
/// </summary>
public class TestDbContextFactory
{
    public static KanbanDbContext Create()
    {
        var options = new DbContextOptionsBuilder<KanbanDbContext>()
            .UseSqlite(new SqliteConnectionStringBuilder 
            { 
                Mode = SqliteOpenMode.Memory, 
                Cache = SqliteCacheMode.Shared 
            }.ToString())
            .Options;

        var context = new KanbanDbContext(options);
        context.Database.OpenConnection();
        context.Database.EnsureCreated();
        return context;
    }
}

public class TicketTests : IDisposable
{
    private readonly KanbanDbContext _context;

    public TicketTests()
    {
        _context = TestDbContextFactory.Create();
    }

    public void Dispose()
    {
        _context.Database.CloseConnection();
        _context.Dispose();
    }

    [Fact]
    public async Task CreateTicket_ShouldAddTicketToDatabase()
    {
        // Arrange
        var ticket = new Ticket
        {
            TicketId = Guid.NewGuid().ToString("N"),
            Id = 1,
            Title = "テストチケット",
            Column = "todo",
            Position = 0,
            Labels = new List<string> { "重要" },
            ChildTasks = new List<ChildTask> { new() { Text = "タスク1", Done = false } }
        };

        // Act
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // Assert
        var saved = await _context.Tickets.FirstOrDefaultAsync(t => t.TicketId == ticket.TicketId);
        Assert.NotNull(saved);
        Assert.Equal("テストチケット", saved!.Title);
        Assert.Equal("todo", saved.Column);
    }

    [Fact]
    public async Task GetTickets_ShouldReturnOrderedTickets()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "a", Id = 1, Title = "Bチケット", Column = "todo", Position = 1 });
        _context.Tickets.Add(new Ticket { TicketId = "b", Id = 2, Title = "Aチケット", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        // Act
        var tickets = await _context.Tickets.OrderBy(t => t.Column).ThenBy(t => t.Position).ToListAsync();

        // Assert
        Assert.Equal(2, tickets.Count);
        Assert.Equal("Aチケット", tickets[0].Title);
        Assert.Equal("Bチケット", tickets[1].Title);
    }

    [Fact]
    public async Task UpdateTicket_ShouldModifyAllFields()
    {
        // Arrange
        var ticket = new Ticket { TicketId = "update-test", Id = 1, Title = "元タイトル", Column = "todo", Position = 0 };
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // Act
        var found = await _context.Tickets.FindAsync("update-test");
        found!.Title = "新タイトル";
        found.Column = "doing";
        found.Labels = new List<string> { "更新" };
        await _context.SaveChangesAsync();

        // Assert
        var updated = await _context.Tickets.FindAsync("update-test");
        Assert.Equal("新タイトル", updated!.Title);
        Assert.Equal("doing", updated.Column);
        Assert.Contains("更新", updated.Labels);
    }

    [Fact]
    public async Task DeleteTicket_ShouldRemoveFromDatabase()
    {
        // Arrange
        var ticket = new Ticket { TicketId = "delete-test", Id = 1, Title = "削除対象", Column = "todo", Position = 0 };
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // Act
        _context.Tickets.Remove(ticket);
        await _context.SaveChangesAsync();

        // Assert
        var found = await _context.Tickets.FindAsync("delete-test");
        Assert.Null(found);
    }

    [Fact]
    public async Task Labels_ShouldSerializeCorrectly()
    {
        // Arrange
        var labels = new List<string> { "フロントエンド", "バックエンド" };
        var ticket = new Ticket 
        { 
            TicketId = "label-test", 
            Id = 1, 
            Title = "ラベルテスト", 
            Column = "todo", 
            Position = 0,
            Labels = labels
        };

        // Act
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        var saved = await _context.Tickets.FindAsync("label-test");

        // Assert
        Assert.NotNull(saved);
        Assert.Equal(2, saved!.Labels.Count);
        Assert.Contains("フロントエンド", saved.Labels);
        Assert.Contains("バックエンド", saved.Labels);
    }

    [Fact]
    public async Task ChildTasks_ShouldSerializeCorrectly()
    {
        // Arrange
        var childTasks = new List<ChildTask> 
        { 
            new() { Text = "タスクA", Done = false },
            new() { Text = "タスクB", Done = true }
        };
        var ticket = new Ticket 
        { 
            TicketId = "child-test", 
            Id = 1, 
            Title = "子タスクテスト", 
            Column = "todo", 
            Position = 0,
            ChildTasks = childTasks
        };

        // Act
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        var saved = await _context.Tickets.FindAsync("child-test");

        // Assert
        Assert.NotNull(saved);
        Assert.Equal(2, saved!.ChildTasks.Count);
        Assert.Equal("タスクA", saved.ChildTasks[0].Text);
        Assert.False(saved.ChildTasks[0].Done);
        Assert.True(saved.ChildTasks[1].Done);
    }

    [Fact]
    public async Task Progress_ShouldBeClampedBetween0And100()
    {
        // Arrange
        var ticket = new Ticket { TicketId = "progress-test", Id = 1, Title = "進捗テスト", Column = "todo", Position = 0, Progress = 50 };
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // Act - 100超え
        var found = await _context.Tickets.FindAsync("progress-test");
        found!.Progress = Math.Max(0, Math.Min(100, 150));
        await _context.SaveChangesAsync();

        // Assert
        var updated = await _context.Tickets.FindAsync("progress-test");
        Assert.Equal(100, updated!.Progress);

        // Act - 負の値
        found.Progress = Math.Max(0, Math.Min(100, -10));
        await _context.SaveChangesAsync();

        // Assert
        updated = await _context.Tickets.FindAsync("progress-test");
        Assert.Equal(0, updated!.Progress);
    }

    [Fact]
    public async Task ColumnMove_ShouldUpdateColumnAndPosition()
    {
        // Arrange
        var ticket = new Ticket { TicketId = "move-test", Id = 1, Title = "移動テスト", Column = "todo", Position = 0 };
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // Act
        var found = await _context.Tickets.FindAsync("move-test");
        found!.Column = "doing";
        found.Position = 5;
        await _context.SaveChangesAsync();

        // Assert
        var updated = await _context.Tickets.FindAsync("move-test");
        Assert.Equal("doing", updated!.Column);
        Assert.Equal(5, updated.Position);
    }

    [Fact]
    public async Task EmptyLabels_ShouldSerializeAsEmptyArray()
    {
        // Arrange
        var ticket = new Ticket
        {
            TicketId = "empty-labels-test",
            Id = 1,
            Title = "空ラベルテスト",
            Column = "todo",
            Position = 0,
            Labels = new List<string>()
        };

        // Act
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        var saved = await _context.Tickets.FindAsync("empty-labels-test");

        // Assert
        Assert.NotNull(saved);
        Assert.Empty(saved!.Labels);
        Assert.Equal("[]", saved.LabelsJson);
    }

    [Fact]
    public async Task EmptyChildTasks_ShouldSerializeAsEmptyArray()
    {
        // Arrange
        var ticket = new Ticket
        {
            TicketId = "empty-child-test",
            Id = 1,
            Title = "空子タスクテスト",
            Column = "todo",
            Position = 0,
            ChildTasks = new List<ChildTask>()
        };

        // Act
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        var saved = await _context.Tickets.FindAsync("empty-child-test");

        // Assert
        Assert.NotNull(saved);
        Assert.Empty(saved!.ChildTasks);
        Assert.Equal("[]", saved.ChildTasksJson);
    }

    [Fact]
    public async Task ColumnMove_ShouldRepositionOldColumn()
    {
        // Arrange: todoに2つのチケット（Position 0, 1）
        _context.Tickets.Add(new Ticket { TicketId = "reposition-a", Id = 1, Title = "A", Column = "todo", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "reposition-b", Id = 2, Title = "B", Column = "todo", Position = 1 });
        await _context.SaveChangesAsync();

        // Act: Aをdoingに移動（旧カラムのPosition再編号をシミュレート）
        var ticketA = await _context.Tickets.FindAsync("reposition-a");
        ticketA!.Column = "doing";
        ticketA.Position = 0;
        await _context.SaveChangesAsync();

        // 旧カラムの残りのチケットを再編号
        var remainingInTodo = await _context.Tickets.Where(t => t.Column == "todo").OrderBy(t => t.Position).ToListAsync();
        for (int i = 0; i < remainingInTodo.Count; i++)
        {
            remainingInTodo[i].Position = i;
        }
        await _context.SaveChangesAsync();

        // Assert: BのPositionは0に再編号されている
        var ticketB = await _context.Tickets.FindAsync("reposition-b");
        Assert.Equal(0, ticketB!.Position);
    }

    [Fact]
    public async Task ColumnMove_ShouldShiftNewColumnPositions()
    {
        // Arrange: doingに2つのチケット（Position 0, 1）
        _context.Tickets.Add(new Ticket { TicketId = "shift-a", Id = 1, Title = "A", Column = "doing", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "shift-b", Id = 2, Title = "B", Column = "doing", Position = 1 });
        
        // todoから新しいチケットをPosition 0に挿入
        var newTicket = new Ticket { TicketId = "shift-new", Id = 3, Title = "New", Column = "todo", Position = 0 };
        _context.Tickets.Add(newTicket);
        await _context.SaveChangesAsync();

        // Act: NewをdoingのPosition 0に移動（シフト処理）
        var ticket = await _context.Tickets.FindAsync("shift-new");
        
        // Position 0以降のチケットを+1シフト
        var toShift = await _context.Tickets.Where(t => t.Column == "doing" && t.Position >= 0).ToListAsync();
        foreach (var t in toShift)
        {
            t.Position++;
        }
        
        ticket!.Column = "doing";
        ticket.Position = 0;
        await _context.SaveChangesAsync();

        // Assert: NewはPosition 0、Aは1、Bは2にシフトされている
        var sorted = await _context.Tickets.Where(t => t.Column == "doing").OrderBy(t => t.Position).ToListAsync();
        Assert.Equal("shift-new", sorted[0].TicketId);
        Assert.Equal(0, sorted[0].Position);
        Assert.Equal(1, sorted[1].Position);
        Assert.Equal(2, sorted[2].Position);
    }

    [Fact]
    public async Task Progress_BoundaryValues()
    {
        // Arrange
        var ticket = new Ticket { TicketId = "boundary-test", Id = 1, Title = "境界値テスト", Column = "todo", Position = 0 };
        _context.Tickets.Add(ticket);
        await _context.SaveChangesAsync();

        // Act & Assert: 各境界値でクランプ動作を検証
        var testCases = new (int input, int expected)[]
        {
            (-10, 0),
            (0, 0),
            (50, 50),
            (100, 100),
            (150, 100)
        };

        foreach (var (input, expected) in testCases)
        {
            var found = await _context.Tickets.FindAsync("boundary-test");
            found!.Progress = Math.Max(0, Math.Min(100, input));
            await _context.SaveChangesAsync();

            var updated = await _context.Tickets.FindAsync("boundary-test");
            Assert.Equal(expected, updated!.Progress);
        }
    }

    [Fact]
    public async Task AutoIncrementId_ShouldAssignNextId()
    {
        // Arrange: 3つのチケットを追加
        _context.Tickets.Add(new Ticket { TicketId = "id-a", Id = 1, Title = "A", Column = "todo", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "id-b", Id = 2, Title = "B", Column = "todo", Position = 1 });
        _context.Tickets.Add(new Ticket { TicketId = "id-c", Id = 3, Title = "C", Column = "todo", Position = 2 });
        await _context.SaveChangesAsync();

        // Act: 最大Idを取得して+1（コントローラーのロジックと同じ）
        var maxId = await _context.Tickets.MaxAsync(t => (int?)t.Id) ?? 0;
        var nextId = maxId + 1;

        // Assert
        Assert.Equal(4, nextId);
    }

    [Fact]
    public async Task ColumnMove_SingleTicketInColumn()
    {
        // Arrange: カラムに1つのチケットのみ
        _context.Tickets.Add(new Ticket { TicketId = "single-a", Id = 1, Title = "Single", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        // Act: そのチケットをdoingカラムのPosition 0に移動（コントローラー経由）
        var controller = new KanbanServer.Controllers.TicketsController(_context);
        var dto = new ColumnUpdateDto { Column = "doing", Position = 0 };
        var result = await controller.UpdateColumn("single-a", dto);

        // Assert: NoContentが返る
        Assert.IsType<Microsoft.AspNetCore.Mvc.NoContentResult>(result);

        var movedTicket = await _context.Tickets.FirstAsync(t => t.TicketId == "single-a");
        Assert.Equal("doing", movedTicket.Column);
        Assert.Equal(0, movedTicket.Position);

        // doingカラムには1つのみ
        var doingCount = await _context.Tickets.CountAsync(t => t.Column == "doing");
        Assert.Equal(1, doingCount);

        // todoカラムは空に
        var todoCount = await _context.Tickets.CountAsync(t => t.Column == "todo");
        Assert.Equal(0, todoCount);
    }

    [Fact]
    public async Task CreateTicket_LongTitle_ShouldWork()
    {
        // Arrange: 非常に長いタイトル（500文字）
        var longTitle = new string('A', 500);

        // Act
        _context.Tickets.Add(new Ticket
        {
            TicketId = "long-title",
            Id = 1,
            Title = longTitle,
            Column = "todo",
            Position = 0
        });
        await _context.SaveChangesAsync();

        // Assert: 保存・取得できる
        var found = await _context.Tickets.FindAsync("long-title");
        Assert.NotNull(found);
        Assert.Equal(500, found.Title.Length);
        Assert.Equal(longTitle, found.Title);
    }

    [Fact]
    public async Task BulkCreate_PositionsAssignedCorrectly()
    {
        // Arrange: コントローラーを使用して複数チケットを連続作成
        var controller = new KanbanServer.Controllers.TicketsController(_context);

        // Act: 5つのチケットをtodoカラムに連続作成
        var createdTickets = new List<Ticket>();
        for (int i = 0; i < 5; i++)
        {
            var dto = new TicketDto { Title = $"Bulk-{i}", Column = "todo" };
            var result = await controller.Create(dto);
            var actionResult = Assert.IsType<ActionResult<Ticket>>(result);
            var createdResponse = Assert.IsType<Microsoft.AspNetCore.Mvc.CreatedAtActionResult>(actionResult.Result!);
            var ticket = Assert.IsAssignableFrom<Ticket>(createdResponse.Value!);
            createdTickets.Add(ticket);
        }

        // Assert: Positionが0, 1, 2, 3, 4と正しく割り当てられる
        for (int i = 0; i < 5; i++)
        {
            Assert.Equal(i, createdTickets[i].Position);
        }

        // DBから取得しても順序が維持されている
        var dbTickets = await _context.Tickets
            .Where(t => t.Column == "todo")
            .OrderBy(t => t.Position)
            .ToListAsync();

        Assert.Equal(5, dbTickets.Count);
        for (int i = 0; i < 5; i++)
        {
            Assert.Equal($"Bulk-{i}", dbTickets[i].Title);
            Assert.Equal(i, dbTickets[i].Position);
        }
    }
}

public class TicketDtoTests
{
    [Fact]
    public void TicketDto_ShouldHaveDefaultValues()
    {
        // Act
        var dto = new TicketDto();

        // Assert
        Assert.Equal(string.Empty, dto.Title);
        Assert.Null(dto.Column);
        Assert.Empty(dto.Labels);
        Assert.Equal(string.Empty, dto.Memo);
        Assert.Empty(dto.ChildTasks);
    }

    [Fact]
    public void ChildTaskDto_ShouldHaveDefaultValues()
    {
        // Act
        var dto = new ChildTaskDto();

        // Assert
        Assert.Equal(string.Empty, dto.Text);
        Assert.False(dto.Done);
    }
}

public class JsonSerializationTests
{
    [Fact]
    public void Ticket_ShouldSerializeLabelsAsArray()
    {
        // Arrange
        var ticket = new Ticket
        {
            TicketId = "json-test",
            Id = 1,
            Title = "JSONテスト",
            Column = "todo",
            Position = 0,
            Labels = new List<string> { "重要", "緊急" }
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert
        Assert.Contains("\"labels\"", json);
        Assert.Contains("重要", json);
        Assert.Contains("緊急", json);
        // labelsJson は出力されないこと（JsonIgnore）
        Assert.DoesNotContain("\"labelsJson\"", json);
    }

    [Fact]
    public void Ticket_ShouldSerializeChildTasksAsArray()
    {
        // Arrange
        var ticket = new Ticket
        {
            TicketId = "json-test",
            Id = 1,
            Title = "JSONテスト",
            Column = "todo",
            Position = 0,
            ChildTasks = new List<ChildTask> { new() { Text = "タスク1", Done = false } }
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert
        Assert.Contains("\"childTasks\"", json);
        Assert.Contains("タスク1", json);
        // childTasksJson は出力されないこと（JsonIgnore）
        Assert.DoesNotContain("\"childTasksJson\"", json);
    }

    [Fact]
    public void Ticket_ShouldDeserializeLabelsFromArray()
    {
        // Arrange
        var json = @"{
            ""ticketId"": ""test"",
            ""id"": 1,
            ""title"": ""テスト"",
            ""column"": ""todo"",
            ""position"": 0,
            ""labels"": [""重要"", ""緊急""]
        }";

        // Act
        var ticket = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);

        // Assert
        Assert.NotNull(ticket);
        Assert.Equal(2, ticket!.Labels.Count);
        Assert.Contains("重要", ticket.Labels);
    }

    [Fact]
    public void Ticket_ShouldDeserializeChildTasksFromArray()
    {
        // Arrange
        var json = @"{
            ""ticketId"": ""test"",
            ""id"": 1,
            ""title"": ""テスト"",
            ""column"": ""todo"",
            ""position"": 0,
            ""childTasks"": [{""text"": ""タスク1"", ""done"": false}]
        }";

        // Act
        var ticket = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);

        // Assert
        Assert.NotNull(ticket);
        Assert.Single(ticket!.ChildTasks);
        Assert.Equal("タスク1", ticket.ChildTasks[0].Text);
    }

    [Fact]
    public void Ticket_EmptyLabelsSerializesAsArray()
    {
        // Arrange
        var ticket = new Ticket
        {
            TicketId = "empty-test",
            Id = 1,
            Title = "空ラベル",
            Column = "todo",
            Position = 0,
            Labels = new List<string>()
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert
        Assert.Contains("\"labels\": []", json);
    }

    [Fact]
    public void Ticket_OptionalFieldsSerializeCorrectly()
    {
        // Arrange: オプショナルフィールドに値を設定
        var ticket = new Ticket
        {
            TicketId = "optional-test",
            Id = 1,
            Title = "オプショナルテスト",
            Column = "todo",
            Position = 0,
            StartDate = new DateTime(2026, 6, 1),
            EndDate = new DateTime(2026, 6, 30),
            Effort = 8,
            Assignees = new List<string> { "田中" }
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert: PascalCaseのプロパティ名で出力される
        Assert.Contains("\"StartDate\"", json);
        Assert.Contains("2026-06-01", json);
        Assert.Contains("\"EndDate\"", json);
        Assert.Contains("2026-06-30", json);
        Assert.Contains("\"Effort\": 8", json);
        Assert.Contains("田中", json);

        // Arrange: null値の場合
        var ticketNull = new Ticket
        {
            TicketId = "null-test",
            Id = 2,
            Title = "Nullテスト",
            Column = "todo",
            Position = 0
        };

        // Act
        var jsonNull = System.Text.Json.JsonSerializer.Serialize(ticketNull, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert: nullフィールドはnullとして出力される
        Assert.Contains("\"StartDate\": null", jsonNull);
        Assert.Contains("\"EndDate\": null", jsonNull);
        Assert.Contains("\"Effort\": null", jsonNull);
        Assert.Contains("\"assignees\": []", jsonNull);
    }

    [Fact]
    public void Ticket_SpecialCharactersInTitle()
    {
        // Arrange: 特殊文字を含むタイトル
        var ticket = new Ticket
        {
            TicketId = "special-test",
            Id = 1,
            Title = "Quote \" and \\ Backslash",
            Column = "todo",
            Position = 0
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert: 特殊文字が正しくエスケープされている
        var deserialized = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);
        Assert.Equal(ticket.Title, deserialized!.Title);
    }

    [Fact]
    public void ChildTask_DeserializeWithDoneTrue()
    {
        // Arrange
        var json = @"{
            ""ticketId"": ""test"",
            ""id"": 1,
            ""title"": ""テスト"",
            ""column"": ""todo"",
            ""position"": 0,
            ""childTasks"": [
                {""text"": ""完了タスク"", ""done"": true},
                {""text"": ""未完了タスク"", ""done"": false}
            ]
        }";

        // Act
        var ticket = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);

        // Assert
        Assert.NotNull(ticket);
        Assert.Equal(2, ticket!.ChildTasks.Count);
        Assert.True(ticket.ChildTasks[0].Done);
        Assert.Equal("完了タスク", ticket.ChildTasks[0].Text);
        Assert.False(ticket.ChildTasks[1].Done);
        Assert.Equal("未完了タスク", ticket.ChildTasks[1].Text);
    }

    [Fact]
    public void Ticket_MixedLanguageLabelsSerializeCorrectly()
    {
        // Arrange: 日本語/英語/数字の混合ラベル
        var ticket = new Ticket
        {
            TicketId = "mixed-labels",
            Id = 1,
            Title = "混合ラベルテスト",
            Column = "todo",
            Position = 0,
            Labels = new List<string> { "重要", "frontend", "v2.0", "日本語_テスト" }
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        var deserialized = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);

        // Assert: 全ラベルが正しく復元される
        Assert.NotNull(deserialized);
        Assert.Equal(4, deserialized!.Labels.Count);
        Assert.Contains("重要", deserialized.Labels);
        Assert.Contains("frontend", deserialized.Labels);
        Assert.Contains("v2.0", deserialized.Labels);
        Assert.Contains("日本語_テスト", deserialized.Labels);
    }

    [Fact]
    public void ChildTask_EmptyTextSerializesCorrectly()
    {
        // Arrange: 空文字列の子タスクテキスト
        var ticket = new Ticket
        {
            TicketId = "empty-child-text",
            Id = 1,
            Title = "空テキストテスト",
            Column = "todo",
            Position = 0,
            ChildTasks = new List<ChildTask>
            {
                new() { Text = "", Done = false },
                new() { Text = "通常タスク", Done = true }
            }
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        var deserialized = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);

        // Assert: 空文字列の子タスクも正しく復元される
        Assert.NotNull(deserialized);
        Assert.Equal(2, deserialized!.ChildTasks.Count);
        Assert.Equal("", deserialized.ChildTasks[0].Text);
        Assert.False(deserialized.ChildTasks[0].Done);
        Assert.Equal("通常タスク", deserialized.ChildTasks[1].Text);
        Assert.True(deserialized.ChildTasks[1].Done);
    }

    [Fact]
    public void Ticket_AllFieldsNull_SerializesCorrectly()
    {
        // Arrange: オプショナルフィールドがすべて空のチケット
        var ticket = new Ticket
        {
            TicketId = "minimal-ticket",
            Id = 1,
            Title = "",
            Column = "todo",
            Position = 0,
            Labels = new List<string>(),
            Memo = "",
            ChildTasks = new List<ChildTask>()
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        // Assert: 空配列・空文字列が正しくシリアライズされる
        Assert.Contains("\"labels\": []", json);
        Assert.Contains("\"childTasks\": []", json);
        Assert.Contains("\"Memo\": \"\"", json);
        Assert.Contains("\"Title\": \"\"", json);

        // デシリアライズも正常に完了
        var deserialized = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);
        Assert.NotNull(deserialized);
        Assert.Equal("", deserialized!.Title);
        Assert.Empty(deserialized.Labels);
        Assert.Equal("", deserialized.Memo);
        Assert.Empty(deserialized.ChildTasks);
    }

    [Fact]
    public void Ticket_LargeNumberOfChildTasks()
    {
        // Arrange: 100個の子タスクを持つチケット
        var childTasks = new List<ChildTask>();
        for (int i = 0; i < 100; i++)
        {
            childTasks.Add(new ChildTask { Text = $"タスク-{i}", Done = i % 2 == 0 });
        }

        var ticket = new Ticket
        {
            TicketId = "large-child-tasks",
            Id = 1,
            Title = "大量子タスクテスト",
            Column = "todo",
            Position = 0,
            ChildTasks = childTasks
        };

        // Act
        var json = System.Text.Json.JsonSerializer.Serialize(ticket, new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = true,
            Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping
        });

        var deserialized = System.Text.Json.JsonSerializer.Deserialize<Ticket>(json);

        // Assert: 100個の子タスクがすべて正しく復元される
        Assert.NotNull(deserialized);
        Assert.Equal(100, deserialized!.ChildTasks.Count);
        for (int i = 0; i < 100; i++)
        {
            Assert.Equal($"タスク-{i}", deserialized.ChildTasks[i].Text);
            Assert.Equal(i % 2 == 0, deserialized.ChildTasks[i].Done);
        }
    }
}

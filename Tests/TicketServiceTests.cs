using KanbanServer.Data;
using KanbanServer.Models;
using KanbanServer.Services;
using Microsoft.EntityFrameworkCore;

namespace Tests;

/// <summary>
/// TicketServiceの直接テスト
/// </summary>
public class TicketServiceTests : IDisposable
{
    private readonly KanbanDbContext _context;
    private readonly TicketService _service;

    public TicketServiceTests()
    {
        _context = TestDbContextFactory.Create();
        _service = new TicketService(_context);
    }

    public void Dispose()
    {
        _context.Database.CloseConnection();
        _context.Dispose();
    }

    // ===== GetAllAsync テスト =====

    [Fact]
    public async Task GetAllAsync_EmptyList_ReturnsEmptyList()
    {
        // Act
        var result = await _service.GetAllAsync();

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetAllAsync_ShouldReturnSortedByColumnThenPosition()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "a", Id = 1, Title = "Doing-1", Column = "doing", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "b", Id = 2, Title = "Todo-2", Column = "todo", Position = 1 });
        _context.Tickets.Add(new Ticket { TicketId = "c", Id = 3, Title = "Todo-1", Column = "todo", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "d", Id = 4, Title = "Done-1", Column = "done", Position = 0, IsArchived = true });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.GetAllAsync();

        // Assert: 明示的なカラム順序（todo→doing→done→archive）→Position降順
        Assert.Equal(4, result.Count);
        Assert.Equal("todo", result[0].Column);
        Assert.Equal("Todo-2", result[0].Title); // todo Position 1 (降順で先頭)
        Assert.Equal("todo", result[1].Column);
        Assert.Equal("Todo-1", result[1].Title); // todo Position 0
        Assert.Equal("doing", result[2].Column);
        Assert.Equal("Doing-1", result[2].Title);
        Assert.Equal("done", result[3].Column);
        Assert.True(result[3].IsArchived);
    }

    // ===== GetAsync テスト =====

    [Fact]
    public async Task GetAsync_ExistingTicket_ReturnsTicket()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "get-test", Id = 1, Title = "取得テスト", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.GetAsync("get-test");

        // Assert
        Assert.NotNull(result);
        Assert.Equal("取得テスト", result!.Title);
    }

    [Fact]
    public async Task GetAsync_NonExistentTicket_ReturnsNull()
    {
        // Act
        var result = await _service.GetAsync("non-existent");

        // Assert
        Assert.Null(result);
    }

    // ===== CreateAsync テスト =====

    [Fact]
    public async Task CreateAsync_ValidDto_ShouldCreateTicket()
    {
        // Arrange
        var dto = new TicketDto
        {
            Title = "新規チケット",
            Column = "todo",
            Labels = new List<string> { "テスト" },
            ChildTasks = new List<ChildTaskDto> { new() { Text = "子タスク1", Done = false } }
        };

        // Act
        var result = await _service.CreateAsync(dto);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("新規チケット", result.Title);
        Assert.Equal("todo", result.Column);
        Assert.Equal(32, result.TicketId.Length);
        Assert.Single(result.Labels);
        Assert.Single(result.ChildTasks);
    }

    [Fact]
    public async Task CreateAsync_EmptyTitle_ThrowsArgumentException()
    {
        // Arrange
        var dto = new TicketDto { Title = "" };

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(dto));
    }

    [Fact]
    public async Task CreateAsync_NullTitle_ThrowsArgumentException()
    {
        // Arrange
        var dto = new TicketDto { Title = null! };

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => _service.CreateAsync(dto));
    }

    [Fact]
    public async Task CreateAsync_ShouldFilterEmptyChildTasks()
    {
        // Arrange
        var dto = new TicketDto
        {
            Title = "テスト",
            ChildTasks = new List<ChildTaskDto>
            {
                new() { Text = "有効", Done = false },
                new() { Text = "", Done = false },
                new() { Text = "  ", Done = true }
            }
        };

        // Act
        var result = await _service.CreateAsync(dto);

        // Assert
        Assert.Single(result.ChildTasks);
        Assert.Equal("有効", result.ChildTasks[0].Text);
    }

    [Fact]
    public async Task CreateAsync_DefaultColumnIsTodo()
    {
        // Arrange
        var dto = new TicketDto { Title = "デフォルトカラム" };

        // Act
        var result = await _service.CreateAsync(dto);

        // Assert
        Assert.Equal("todo", result.Column);
    }

    [Fact]
    public async Task CreateAsync_MultipleTickets_IncrementPositions()
    {
        // Act: 同じカラムに3つ作成
        var dto1 = new TicketDto { Title = "First", Column = "todo" };
        var t1 = await _service.CreateAsync(dto1);

        var dto2 = new TicketDto { Title = "Second", Column = "todo" };
        var t2 = await _service.CreateAsync(dto2);

        var dto3 = new TicketDto { Title = "Third", Column = "todo" };
        var t3 = await _service.CreateAsync(dto3);

        // Assert: Positionが 0, 1000, 2000
        Assert.Equal(0, t1.Position);
        Assert.Equal(1000, t2.Position);
        Assert.Equal(2000, t3.Position);
    }

    // ===== UpdateAsync テスト =====

    [Fact]
    public async Task UpdateAsync_ExistingTicket_ShouldUpdateFields()
    {
        // Arrange
        _context.Tickets.Add(new Ticket
        {
            TicketId = "update-test", Id = 1, Title = "元タイトル", Column = "todo", Position = 0,
            StartDate = new DateTime(2025, 1, 1), EndDate = new DateTime(2025, 1, 31)
        });
        await _context.SaveChangesAsync();

        var dto = new TicketDto
        {
            Title = "新タイトル",
            Column = "doing",
            StartDate = new DateTime(2025, 2, 1),
            EndDate = new DateTime(2025, 2, 28),
            Labels = new List<string> { "新ラベル" }
        };

        // Act
        var result = await _service.UpdateAsync("update-test", dto);

        // Assert
        Assert.NotNull(result);
        Assert.Equal("新タイトル", result!.Title);
        Assert.Equal("doing", result.Column);
        Assert.Equal(new DateTime(2025, 2, 1), result.StartDate);
        Assert.Single(result.Labels);
    }

    [Fact]
    public async Task UpdateAsync_NonExistentTicket_ReturnsNull()
    {
        // Arrange
        var dto = new TicketDto { Title = "更新" };

        // Act
        var result = await _service.UpdateAsync("non-existent", dto);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task UpdateAsync_EmptyTitle_ThrowsArgumentException()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "update-empty", Id = 1, Title = "元", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        var dto = new TicketDto { Title = "" };

        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(() => _service.UpdateAsync("update-empty", dto));
    }

    [Fact]
    public async Task UpdateAsync_NullDates_ShouldKeepExistingDates()
    {
        // Arrange
        _context.Tickets.Add(new Ticket
        {
            TicketId = "date-keep", Id = 1, Title = "日付保持", Column = "todo", Position = 0,
            StartDate = new DateTime(2025, 6, 1), EndDate = new DateTime(2025, 6, 30)
        });
        await _context.SaveChangesAsync();

        var dto = new TicketDto
        {
            Title = "日付保持",
            StartDate = null,
            EndDate = null
        };

        // Act
        var result = await _service.UpdateAsync("date-keep", dto);

        // Assert: nullは既存データを上書きしない
        Assert.Equal(new DateTime(2025, 6, 1), result!.StartDate);
        Assert.Equal(new DateTime(2025, 6, 30), result.EndDate);
    }

    // ===== ArchiveAsync テスト =====

    [Fact]
    public async Task ArchiveAsync_ShouldSetIsArchivedAndColumn()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "archive-test", Id = 1, Title = "アーカイブテスト", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.ArchiveAsync("archive-test");

        // Assert
        Assert.NotNull(result);
        Assert.True(result!.IsArchived);
        Assert.Equal("archive", result.Column);
    }

    [Fact]
    public async Task ArchiveAsync_AlreadyArchived_DoNothing()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "already-archived", Id = 1, Title = "既アーカイブ", Column = "archive", Position = 0, IsArchived = true });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.ArchiveAsync("already-archived");

        // Assert
        Assert.NotNull(result);
        Assert.True(result!.IsArchived);
    }

    [Fact]
    public async Task ArchiveAsync_NonExistentTicket_ReturnsNull()
    {
        // Act
        var result = await _service.ArchiveAsync("non-existent");

        // Assert
        Assert.Null(result);
    }

    // ===== DeleteAsync テスト =====

    [Fact]
    public async Task DeleteAsync_ShouldSoftDeleteTicket()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "delete-test", Id = 1, Title = "削除テスト", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.DeleteAsync("delete-test");

        // Assert - ソフト削除なのでIsDeleted=trueになる
        Assert.True(result);
        var found = await _context.Tickets.FindAsync("delete-test");
        Assert.NotNull(found);
        Assert.True(found.IsDeleted);
        Assert.NotNull(found.DeletedAt);
    }

    [Fact]
    public async Task DeleteAsync_NonExistentTicket_ReturnsFalse()
    {
        // Act
        var result = await _service.DeleteAsync("non-existent");

        // Assert
        Assert.False(result);
    }

    // ===== RestoreAsync テスト =====

    [Fact]
    public async Task RestoreAsync_ShouldUnarchiveTicket()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "restore-test", Id = 1, Title = "復帰テスト", Column = "archive", Position = 0, IsArchived = true });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.RestoreAsync("restore-test");

        // Assert
        Assert.NotNull(result);
        Assert.False(result!.IsArchived);
    }

    [Fact]
    public async Task RestoreAsync_NonExistentTicket_ReturnsNull()
    {
        // Act
        var result = await _service.RestoreAsync("non-existent");

        // Assert
        Assert.Null(result);
    }

    // ===== UpdateColumnAsync テスト =====

    [Fact]
    public async Task UpdateColumnAsync_ShouldChangeColumn()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "col-move", Id = 1, Title = "移動テスト", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        var dto = new ColumnUpdateDto { Column = "doing", InsertIndex = 0 };

        // Act
        var result = await _service.UpdateColumnAsync("col-move", dto);

        // Assert
        Assert.True(result);
        var ticket = await _context.Tickets.FindAsync("col-move");
        Assert.Equal("doing", ticket!.Column);
    }

    [Fact]
    public async Task UpdateColumnAsync_NonExistentTicket_ReturnsFalse()
    {
        // Arrange
        var dto = new ColumnUpdateDto { Column = "doing" };

        // Act
        var result = await _service.UpdateColumnAsync("non-existent", dto);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task UpdateColumnAsync_InsertIndex_ShouldPositionCorrectly()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "pos-a", Id = 1, Title = "A", Column = "doing", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "pos-b", Id = 2, Title = "B", Column = "doing", Position = 1 });
        _context.Tickets.Add(new Ticket { TicketId = "pos-move", Id = 3, Title = "移動", Column = "todo", Position = 0 });
        await _context.SaveChangesAsync();

        // Act: インデックス1に挿入（AとBの間）
        var dto = new ColumnUpdateDto { Column = "doing", InsertIndex = 1 };
        await _service.UpdateColumnAsync("pos-move", dto);

        // Assert
        var sorted = await _context.Tickets.Where(t => t.Column == "doing").OrderBy(t => t.Position).ToListAsync();
        Assert.Equal(3, sorted.Count);
        Assert.Equal("pos-a", sorted[0].TicketId);
        Assert.Equal("pos-move", sorted[1].TicketId);
        Assert.Equal("pos-b", sorted[2].TicketId);
    }

    [Fact]
    public async Task UpdateColumnAsync_NoInsertIndex_AppendsToEnd()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "append-a", Id = 1, Title = "A", Column = "doing", Position = 0 });
        _context.Tickets.Add(new Ticket { TicketId = "append-b", Id = 2, Title = "B", Column = "doing", Position = 1 });
        await _context.SaveChangesAsync();

        // Act: InsertIndex未指定
        var dto = new ColumnUpdateDto { Column = "doing" };
        await _service.UpdateColumnAsync("append-a", dto);

        // Assert: append-aは末尾に移動
        var sorted = await _context.Tickets.Where(t => t.Column == "doing").OrderBy(t => t.Position).ToListAsync();
        Assert.Equal("append-a", sorted[1].TicketId);
    }

    // ===== UpdateProgressAsync テスト =====

    [Fact]
    public async Task UpdateProgressAsync_ShouldUpdateProgress()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "progress-test", Id = 1, Title = "進捗テスト", Column = "todo", Position = 0, Progress = 0 });
        await _context.SaveChangesAsync();

        var dto = new ProgressUpdateDto { Progress = 75 };

        // Act
        var result = await _service.UpdateProgressAsync("progress-test", dto);

        // Assert
        Assert.True(result);
        var ticket = await _context.Tickets.FindAsync("progress-test");
        Assert.Equal(75, ticket!.Progress);
    }

    [Fact]
    public async Task UpdateProgressAsync_ClampsOver100()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "clamp-over", Id = 1, Title = "クランプ上", Column = "todo", Position = 0, Progress = 0 });
        await _context.SaveChangesAsync();

        var dto = new ProgressUpdateDto { Progress = 150 };

        // Act
        await _service.UpdateProgressAsync("clamp-over", dto);

        // Assert
        var ticket = await _context.Tickets.FindAsync("clamp-over");
        Assert.Equal(100, ticket!.Progress);
    }

    [Fact]
    public async Task UpdateProgressAsync_ClampsUnder0()
    {
        // Arrange
        _context.Tickets.Add(new Ticket { TicketId = "clamp-under", Id = 1, Title = "クランプ下", Column = "todo", Position = 0, Progress = 50 });
        await _context.SaveChangesAsync();

        var dto = new ProgressUpdateDto { Progress = -20 };

        // Act
        await _service.UpdateProgressAsync("clamp-under", dto);

        // Assert
        var ticket = await _context.Tickets.FindAsync("clamp-under");
        Assert.Equal(0, ticket!.Progress);
    }

    [Fact]
    public async Task UpdateProgressAsync_NonExistentTicket_ReturnsFalse()
    {
        // Arrange
        var dto = new ProgressUpdateDto { Progress = 50 };

        // Act
        var result = await _service.UpdateProgressAsync("non-existent", dto);

        // Assert
        Assert.False(result);
    }

    // ===== UpdateChildTaskAsync テスト =====

    [Fact]
    public async Task UpdateChildTaskAsync_ShouldUpdateChildDone()
    {
        // Arrange
        var childId = Guid.NewGuid().ToString("N");
        _context.Tickets.Add(new Ticket
        {
            TicketId = "child-update", Id = 1, Title = "子タスク更新", Column = "todo", Position = 0,
            ChildTasks = new List<ChildTask> { new() { Id = childId, Text = "タスク1", Done = false } }
        });
        await _context.SaveChangesAsync();

        var dto = new ChildTaskUpdateDto { Done = true };

        // Act
        var result = await _service.UpdateChildTaskAsync("child-update", childId, dto);

        // Assert
        Assert.NotNull(result);
        Assert.True(result!.ChildTasks[0].Done);
    }

    [Fact]
    public async Task UpdateChildTaskAsync_NonExistentTicket_ReturnsNull()
    {
        // Arrange
        var dto = new ChildTaskUpdateDto { Done = true };

        // Act
        var result = await _service.UpdateChildTaskAsync("non-existent", "child-1", dto);

        // Assert
        Assert.Null(result);
    }

    [Fact]
    public async Task UpdateChildTaskAsync_NonExistentChild_ReturnsNull()
    {
        // Arrange
        _context.Tickets.Add(new Ticket
        {
            TicketId = "child-missing", Id = 1, Title = "子なし", Column = "todo", Position = 0,
            ChildTasks = new List<ChildTask> { new() { Id = "valid-id", Text = "タスク", Done = false } }
        });
        await _context.SaveChangesAsync();

        var dto = new ChildTaskUpdateDto { Done = true };

        // Act
        var result = await _service.UpdateChildTaskAsync("child-missing", "non-existent-child", dto);

        // Assert
        Assert.Null(result);
    }

    // ===== GetLabelsSuggestAsync テスト =====

    [Fact]
    public async Task GetLabelsSuggestAsync_ShouldReturnLabelsFromSettings()
    {
        // Arrange
        var setting = new Setting
        {
            Id = 1,
            Labels = new List<LabelConfig>
            {
                new() { Name = "重要", Color = "#ef4444" },
                new() { Name = "緊急", Color = "#f59e0b" }
            }
        };
        _context.Settings.Add(setting);
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.GetLabelsSuggestAsync();

        // Assert
        Assert.Equal(2, result.Count);
        Assert.Contains(result, l => l.Name == "重要" && l.Color == "#ef4444");
        Assert.Contains(result, l => l.Name == "緊急" && l.Color == "#f59e0b");
    }

    [Fact]
    public async Task GetLabelsSuggestAsync_ShouldIncludeLabelsFromTickets()
    {
        // Arrange: 設定なし、チケットにラベルあり
        _context.Tickets.Add(new Ticket
        {
            TicketId = "label-ticket", Id = 1, Title = "ラベルテスト", Column = "todo", Position = 0,
            Labels = new List<string> { "チケットラベル" }
        });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.GetLabelsSuggestAsync();

        // Assert
        Assert.Single(result);
        Assert.Equal("チケットラベル", result[0].Name);
    }

    [Fact]
    public async Task GetLabelsSuggestAsync_EmptySettings_ReturnsEmptyList()
    {
        // Act
        var result = await _service.GetLabelsSuggestAsync();

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetLabelsSuggestAsync_InvalidJson_ShouldNotThrow()
    {
        // Arrange: 無効なJSON
        _context.Tickets.Add(new Ticket
        {
            TicketId = "bad-json", Id = 1, Title = "無効JSON", Column = "todo", Position = 0,
            LabelsJson = "invalid-json"
        });
        await _context.SaveChangesAsync();

        // Act & Assert: 例外なし
        var result = await _service.GetLabelsSuggestAsync();
        Assert.Empty(result);
    }

    // ===== GetAssigneesSuggestAsync テスト =====

    [Fact]
    public async Task GetAssigneesSuggestAsync_ShouldReturnUsersFromSettings()
    {
        // Arrange
        var setting = new Setting
        {
            Id = 1,
            Users = new List<string> { "田中", "鈴木", "高橋" }
        };
        _context.Settings.Add(setting);
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.GetAssigneesSuggestAsync();

        // Assert
        Assert.Equal(3, result.Count);
        Assert.Contains("田中", result);
        Assert.Contains("鈴木", result);
        Assert.Contains("高橋", result);
    }

    [Fact]
    public async Task GetAssigneesSuggestAsync_ShouldIncludeAssigneesFromTickets()
    {
        // Arrange: 設定なし、チケットに担当者あり
        _context.Tickets.Add(new Ticket
        {
            TicketId = "assignee-ticket", Id = 1, Title = "担当者テスト", Column = "todo", Position = 0,
            Assignees = new List<string> { "山田" }
        });
        await _context.SaveChangesAsync();

        // Act
        var result = await _service.GetAssigneesSuggestAsync();

        // Assert
        Assert.Single(result);
        Assert.Equal("山田", result[0]);
    }

    [Fact]
    public async Task GetAssigneesSuggestAsync_EmptySettings_ReturnsEmptyList()
    {
        // Act
        var result = await _service.GetAssigneesSuggestAsync();

        // Assert
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetAssigneesSuggestAsync_InvalidJson_ShouldNotThrow()
    {
        // Arrange: 無効なJSON
        _context.Tickets.Add(new Ticket
        {
            TicketId = "bad-assignee-json", Id = 1, Title = "無効JSON", Column = "todo", Position = 0,
            AssigneesJson = "{invalid"
        });
        await _context.SaveChangesAsync();

        // Act & Assert: 例外なし
        var result = await _service.GetAssigneesSuggestAsync();
        Assert.Empty(result);
    }
}

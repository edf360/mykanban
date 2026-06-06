namespace KanbanServer.Models;

/// <summary>
/// チケット作成・更新用のDTO
/// </summary>
public class TicketDto
{
    public string Title { get; set; } = string.Empty;
    public string? Column { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? Effort { get; set; }
    public List<string> Assignees { get; set; } = new();
    public string? MainAssignee { get; set; }
    public List<string> Labels { get; set; } = new();
    public string Memo { get; set; } = string.Empty;
    public List<ChildTaskDto> ChildTasks { get; set; } = new();
    public bool IsLocked { get; set; }
}

public class ChildTaskDto
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Text { get; set; } = string.Empty;
    public bool Done { get; set; }
}

/// <summary>
/// カラム変更用のDTO
/// </summary>
public class ColumnUpdateDto
{
    public string Column { get; set; } = string.Empty;
    /// <summary>
    /// 挿入先のインデックス（0 = 先頭、null = 末尾）
    /// サーバー側で中間値を計算するために使用
    /// </summary>
    public int? InsertIndex { get; set; }
}

/// <summary>
/// 進捗更新用のDTO
/// </summary>
public class ProgressUpdateDto
{
    public int Progress { get; set; }
}

/// <summary>
/// 子タスク更新用のDTO
/// </summary>
public class ChildTaskUpdateDto
{
    public bool Done { get; set; }
}

/// <summary>
/// ラベルサジェスト用DTO（色情報含む）
/// </summary>
public class LabelSuggestDto
{
    public string Name { get; set; } = string.Empty;
    public string Color { get; set; } = "#808080";
}

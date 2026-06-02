using System.Text.Json;
using System.Text.Json.Serialization;

namespace KanbanServer.Models;

public class Ticket
{
    public string TicketId { get; set; } = string.Empty;
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
    public string Column { get; set; } = "todo";
    public double Position { get; set; }
    public int Progress { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? Effort { get; set; }

    // DB用フィールド（シリアライズ時は非表示）
    [JsonIgnore]
    public string AssigneesJson { get; set; } = "[]";

    [JsonIgnore]
    public string LabelsJson { get; set; } = "[]";

    // 担当者配列（APIレスポンス用）
    [JsonPropertyName("assignees")]
    public List<string> Assignees
    {
        get => JsonSerializer.Deserialize<List<string>>(AssigneesJson) ?? new();
        set => AssigneesJson = JsonSerializer.Serialize(value);
    }

    // メイン担当者（担当者の一人を指定）
    [JsonPropertyName("mainAssignee")]
    public string? MainAssignee { get; set; }

    public string Memo { get; set; } = string.Empty;

    [JsonIgnore]
    public string ChildTasksJson { get; set; } = "[]";

    // APIレスポンス用プロパティ（シリアライズ時に出力）
    [JsonPropertyName("labels")]
    public List<string> Labels
    {
        get => JsonSerializer.Deserialize<List<string>>(LabelsJson) ?? new();
        set => LabelsJson = JsonSerializer.Serialize(value);
    }

    [JsonPropertyName("childTasks")]
    public List<ChildTask> ChildTasks
    {
        get => JsonSerializer.Deserialize<List<ChildTask>>(ChildTasksJson) ?? new();
        set => ChildTasksJson = JsonSerializer.Serialize(value);
    }
}

public class ChildTask
{
    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("done")]
    public bool Done { get; set; }
}

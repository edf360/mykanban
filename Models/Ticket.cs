using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace KanbanServer.Models;

public class Ticket
{
    public string TicketId { get; set; } = string.Empty;
    
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
    public string Column { get; set; } = "todo";
    public string? PreviousColumn { get; set; }
    public double Position { get; set; }
    public int Progress { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? Effort { get; set; }
    public bool IsLocked { get; set; }
    public bool IsEmergency { get; set; }

    // DB用フィールド（シリアライズ時は非表示）
    [JsonIgnore]
    public string AssigneesJson { get; set; } = "[]";

    [JsonIgnore]
    public string LabelsJson { get; set; } = "[]";

    // 担当者配列（APIレスポンス用）
    [JsonPropertyName("assignees")]
    public List<string> Assignees
    {
        get
        {
            try
            {
                return JsonSerializer.Deserialize<List<string>>(AssigneesJson) ?? new();
            }
            catch (JsonException)
            {
                return new();
            }
        }
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
        get
        {
            try
            {
                return JsonSerializer.Deserialize<List<string>>(LabelsJson) ?? new();
            }
            catch (JsonException)
            {
                return new();
            }
        }
        set => LabelsJson = JsonSerializer.Serialize(value);
    }

    [JsonPropertyName("childTasks")]
    public List<ChildTask> ChildTasks
    {
        get
        {
            try
            {
                return JsonSerializer.Deserialize<List<ChildTask>>(ChildTasksJson) ?? new();
            }
            catch (JsonException)
            {
                return new();
            }
        }
        set => ChildTasksJson = JsonSerializer.Serialize(value);
    }
}

public class ChildTask
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    [JsonPropertyName("done")]
    public bool Done { get; set; }

    [JsonPropertyName("progress")]
    public int Progress { get; set; }
}

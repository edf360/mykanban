using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Linq;

namespace KanbanServer.Models;

public class Ticket
{
    public string TicketId { get; set; } = string.Empty;
    
    public string Title { get; set; } = string.Empty;
    public bool IsArchived { get; set; }
    public string Column { get; set; } = "todo";
    public double Position { get; set; }
    public int Progress { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public int? Effort { get; set; }
    public bool IsLocked { get; set; }
    public bool IsEmergency { get; set; }
    public string? Category { get; set; }
    public DateTime CreatedAt { get; set; }

    // 監査用列
    [JsonPropertyName("createdAtBy")]
    public string? CreatedBy { get; set; }

    [JsonPropertyName("updatedAt")]
    public DateTime? UpdatedAt { get; set; }

    [JsonPropertyName("updatedBy")]
    public string? UpdatedBy { get; set; }

    // ソフト削除用列
    [JsonIgnore]
    public bool IsDeleted { get; set; }

    [JsonIgnore]
    public DateTime? DeletedAt { get; set; }

    public string Memo { get; set; } = string.Empty;

    /// <summary>
    /// 担当者中間テーブルへのナビゲーションプロパティ
    /// </summary>
    [JsonIgnore]
    public virtual ICollection<TicketAssignee> TicketAssignees { get; set; } = new List<TicketAssignee>();

    /// <summary>
    /// ラベル中間テーブルへのナビゲーションプロパティ
    /// </summary>
    [JsonIgnore]
    public virtual ICollection<TicketLabel> TicketLabels { get; set; } = new List<TicketLabel>();

    // 担当者配列（APIレスポンス用）
    [JsonPropertyName("assignees")]
    public List<string> Assignees
    {
        get => TicketAssignees?.Select(a => a.Assignee).ToList() ?? new();
        set
        {
            TicketAssignees = new List<TicketAssignee>();
            foreach (var assignee in value)
            {
                TicketAssignees.Add(new TicketAssignee { Assignee = assignee });
            }
        }
    }

    // ラベル配列（APIレスポンス用）
    [JsonPropertyName("labels")]
    public List<string> Labels
    {
        get => TicketLabels?.Select(l => l.Label).ToList() ?? new();
        set
        {
            TicketLabels = new List<TicketLabel>();
            foreach (var label in value)
            {
                TicketLabels.Add(new TicketLabel { Label = label });
            }
        }
    }

    /// <summary>
    /// 独立テーブルの子タスク（ナビゲーションプロパティ）
    /// </summary>
    [JsonIgnore]
    public virtual ICollection<ChildTask> ChildTasksEntities { get; set; } = new List<ChildTask>();

    /// <summary>
    /// 子タスク一覧（APIレスポンス用）
    /// </summary>
    [JsonPropertyName("childTasks")]
    public List<ChildTask> ChildTasks
    {
        get => ChildTasksEntities?.OrderBy(ct => ct.OrderIndex).ToList() ?? new();
        set
        {
            ChildTasksEntities = new List<ChildTask>();
            foreach (var ct in value)
            {
                ChildTasksEntities.Add(ct);
            }
        }
    }
}

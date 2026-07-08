using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// チケットと担当者の中間テーブル
/// </summary>
public class TicketAssignee
{
    public string TicketId { get; set; } = string.Empty;  // FK, PK
    
    public string Assignee { get; set; } = string.Empty;  // PK
    
    [JsonIgnore]
    public Ticket? Ticket { get; set; }
}

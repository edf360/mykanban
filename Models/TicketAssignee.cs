using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// チケットと担当者の中間テーブル
/// </summary>
public class TicketAssignee
{
    public string TicketId { get; set; } = string.Empty;  // FK, PK
    
    public string Assignee { get; set; } = string.Empty;  // PK
    
    /// <summary>
    /// プライマリ（メイン）担当者かどうか
    /// </summary>
    public bool IsPrimary { get; set; }
    
    [JsonIgnore]
    public Ticket? Ticket { get; set; }
}

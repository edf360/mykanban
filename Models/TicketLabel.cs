using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// チケットとラベルの中間テーブル
/// </summary>
public class TicketLabel
{
    public string TicketId { get; set; } = string.Empty;  // FK, PK
    
    public string Label { get; set; } = string.Empty;     // PK
    
    [JsonIgnore]
    public Ticket? Ticket { get; set; }
}

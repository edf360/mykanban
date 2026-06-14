using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// チケットの日次実績作業時間
/// </summary>
public class TicketActual
{
    [Key]
    public int Id { get; set; }
    
    /// <summary>
    /// 関連するチケットID
    /// </summary>
    [Required]
    public string TicketId { get; set; } = string.Empty;
    
    /// <summary>
    /// 作業日付
    /// </summary>
    [Required]
    public DateTime Date { get; set; }
    
    /// <summary>
    /// 作業時間（時間単位、小数点1桁）
    /// </summary>
    public double Hours { get; set; }
}

using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// チケットの履歴ログ（1日につき1件の最新値のみ保存）
/// </summary>
public class TicketHistory
{
    public int Id { get; set; }
    
    /// <summary>
    /// 関連するチケットID
    /// </summary>
    public string TicketId { get; set; } = string.Empty;

    /// <summary>
    /// 履歴タイプ（created, progress, column, assignee）
    /// </summary>
    public string Type { get; set; } = string.Empty;

    /// <summary>
    /// 値（進捗パーセント、カラム名、担当者リストのJSONなど）
    /// </summary>
    public string? Value { get; set; }

    /// <summary>
    /// 前回の値（移動元カラムなど）
    /// </summary>
    public string? PreviousValue { get; set; }

    /// <summary>
    /// 日付（時刻は切り捨て、日付のみ）
    /// </summary>
    [JsonPropertyName("date")]
    public DateTime Date { get; set; }
}

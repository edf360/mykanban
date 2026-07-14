using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// 子タスク（独立テーブル）
/// </summary>
public class ChildTask
{
    [Key]
    [JsonPropertyName("id")]
    public string Id { get; set; } = Guid.NewGuid().ToString("N");

    /// <summary>
    /// 親チケットID（シリアライズしない）
    /// </summary>
    [Required]
    [JsonIgnore]
    public string TicketId { get; set; } = string.Empty;

    /// <summary>
    /// タスク名
    /// </summary>
    [Required]
    [JsonPropertyName("text")]
    public string Text { get; set; } = string.Empty;

    /// <summary>
    /// 完了フラグ
    /// </summary>
    [JsonPropertyName("done")]
    public bool Done { get; set; }

    /// <summary>
    /// カテゴリ
    /// </summary>
    [JsonPropertyName("category")]
    public string? Category { get; set; }

    /// <summary>
    /// メモ
    /// </summary>
    [JsonPropertyName("memo")]
    public string? Memo { get; set; }

    /// <summary>
    /// リビュー状態 (none, request, accept, reject)
    /// </summary>
    [JsonPropertyName("reviewState")]
    public string ReviewState { get; set; } = "none";

    /// <summary>
    /// 順序インデックス
    /// </summary>
    [JsonPropertyName("orderIndex")]
    public int OrderIndex { get; set; }

    /// <summary>
    /// 作成日時
    /// </summary>
    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    /// <summary>
    /// 更新日時
    /// </summary>
    [JsonPropertyName("updatedAt")]
    public DateTime? UpdatedAt { get; set; }

    /// <summary>
    /// 親チケット（ナビゲーションプロパティ）
    /// </summary>
    [JsonIgnore]
    public Ticket? Ticket { get; set; }
}

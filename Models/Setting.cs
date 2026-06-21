using System.Text.Json;
using System.Text.Json.Serialization;

namespace KanbanServer.Models;

/// <summary>
/// 設定エンティティ（単一レコード管理）
/// </summary>
public class Setting
{
    public int Id { get; set; } = 1;

    // DB用JSONフィールド（シリアライズ時は非表示）
    [JsonIgnore]
    public string UsersJson { get; set; } = "[]";

    [JsonIgnore]
    public string LabelsJson { get; set; } = "[]";

    [JsonIgnore]
    public string HolidaysJson { get; set; } = "[]";

    [JsonIgnore]
    public string MemosJson { get; set; } = "{}";

    // ユーザリスト（APIレスポンス用）
    [JsonPropertyName("users")]
    public List<string> Users
    {
        get => JsonSerializer.Deserialize<List<string>>(UsersJson ?? "[]") ?? new();
        set => UsersJson = JsonSerializer.Serialize(value);
    }

    // ラベル設定リスト（APIレスポンス用）
    [JsonPropertyName("labels")]
    public List<LabelConfig> Labels
    {
        get => JsonSerializer.Deserialize<List<LabelConfig>>(LabelsJson ?? "[]") ?? new();
        set => LabelsJson = JsonSerializer.Serialize(value);
    }

    // 休日リスト（APIレスポンス用）
    [JsonPropertyName("holidays")]
    public List<string> Holidays
    {
        get => JsonSerializer.Deserialize<List<string>>(HolidaysJson ?? "[]") ?? new();
        set => HolidaysJson = JsonSerializer.Serialize(value);
    }

    // 担当者メモ（APIレスポンス用）
    [JsonPropertyName("memos")]
    public Dictionary<string, string> Memos
    {
        get => JsonSerializer.Deserialize<Dictionary<string, string>>(MemosJson ?? "{}") ?? new();
        set => MemosJson = JsonSerializer.Serialize(value);
    }
}

/// <summary>
/// ラベル設定（名前＋色）
/// </summary>
public class LabelConfig
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("color")]
    public string Color { get; set; } = "#808080";
}

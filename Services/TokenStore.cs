using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Timers;

namespace KanbanServer.Services;

/// <summary>
/// 認証トークンの管理（ファイル持久化）
/// サーバー再起動後もトークンを保持する
/// </summary>
public class TokenStore
{
    private static readonly ConcurrentDictionary<string, TokenInfo> _tokens = new();
    private static readonly System.Timers.Timer _cleanupTimer;
    private static readonly string _tokenFilePath;
    private static readonly object _fileLock = new();

    public record TokenInfo(string Username, bool IsAdmin, DateTimeOffset Expiry);
    private record TokenData(string Token, string Username, bool IsAdmin, string Expiry);

    static TokenStore()
    {
        _tokenFilePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "tokens.json");
        LoadTokens();

        // 1時間ごとに有効期限切れトークンをクリーンアップ
        _cleanupTimer = new System.Timers.Timer(3600_000);
        _cleanupTimer.Elapsed += (_, _) =>
        {
            CleanupExpiredTokens();
            SaveTokens();
        };
        _cleanupTimer.AutoReset = true;
        _cleanupTimer.Start();
    }

    /// <summary>
    /// ファイルからトークンを読み込む
    /// </summary>
    private static void LoadTokens()
    {
        if (!File.Exists(_tokenFilePath))
        {
            return;
        }

        try
        {
            var json = File.ReadAllText(_tokenFilePath);
            var data = JsonSerializer.Deserialize<TokenData[]>(json) ?? Array.Empty<TokenData>();

            var now = DateTimeOffset.UtcNow;
            foreach (var item in data)
            {
                if (DateTimeOffset.TryParse(item.Expiry, out var expiry))
                {
                    // 【BUG-03修正】ValidateToken() と一貫させるため >= を使用
                    // now >= expiry の場合（有効期限切れ）は読み込まない
                    if (now < expiry)
                    {
                        _tokens[item.Token] = new TokenInfo(item.Username, item.IsAdmin, expiry);
                    }
                }
            }
        }
        catch (Exception)
        {
            // ファイル読み込み失敗は無視（空の状態から開始）
        }
    }

    /// <summary>
    /// トークンをファイルに保存
    /// </summary>
    private static void SaveTokens()
    {
        lock (_fileLock)
        {
            try
            {
                var data = _tokens.Select(kvp => new TokenData(
                    kvp.Key,
                    kvp.Value.Username,
                    kvp.Value.IsAdmin,
                    kvp.Value.Expiry.ToString("o")
                )).ToArray();

                var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_tokenFilePath, json);
            }
            catch (Exception)
            {
                // ファイル保存失敗はログに出さない（重要ではない）
            }
        }
    }

    /// <summary>
    /// 新しいトークンを生成して保存
    /// 有効期限はデフォルト24時間
    /// </summary>
    public string CreateToken(string username, bool isAdmin, TimeSpan? expiry = null)
    {
        // 暗号的に安全なトークンを生成（32バイト = 256ビット）
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .Replace("+", "-").Replace("/", "_").Replace("=", "");
        var expiryTime = DateTimeOffset.UtcNow + (expiry ?? TimeSpan.FromHours(24));
        _tokens[token] = new TokenInfo(username, isAdmin, expiryTime);
        SaveTokens();
        return token;
    }

    /// <summary>
    /// トークンを検証してユーザー情報を取得
    /// 有効期限が切れたトークンは自動的に削除される
    /// </summary>
    public TokenInfo? ValidateToken(string token)
    {
        if (_tokens.TryGetValue(token, out var info))
        {
            // 【BUG-03修正】LoadTokens() と一貫させるため >= に変更
            // 有効期限の瞬間 itself も無効とする
            if (DateTimeOffset.UtcNow >= info.Expiry)
            {
                _tokens.TryRemove(token, out _);
                SaveTokens();
                return null;
            }
            return info;
        }
        return null;
    }

    /// <summary>
    /// トークンを無効化（ログアウト）
    /// </summary>
    public void RevokeToken(string token)
    {
        _tokens.TryRemove(token, out _);
        SaveTokens();
    }

    /// <summary>
    /// 有効期限切れのトークンを一括削除（メモリリーク対策）
    /// </summary>
    private static void CleanupExpiredTokens()
    {
        // 【BUG-03修正】LoadTokens()/ValidateToken() と一貫させるため >= に変更
        var now = DateTimeOffset.UtcNow;
        foreach (var kvp in _tokens)
        {
            if (now >= kvp.Value.Expiry)
            {
                _tokens.TryRemove(kvp.Key, out _);
            }
        }
    }

    /// <summary>
    /// 【BUG-15修正】タイマーをDisposeし、リソースリークを防ぐ
    /// アプリケーション終了時に呼び出される
    /// </summary>
    public static void Cleanup()
    {
        _cleanupTimer?.Stop();
        _cleanupTimer?.Dispose();
    }
}

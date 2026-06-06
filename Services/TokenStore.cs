using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Timers;

namespace KanbanServer.Services;

/// <summary>
/// 認証トークンの管理（メモリ上）
/// サーバー再起動で全トークン失効
/// </summary>
public class TokenStore
{
    private static readonly ConcurrentDictionary<string, TokenInfo> _tokens = new();
    private static readonly System.Timers.Timer _cleanupTimer;

    static TokenStore()
    {
        // 1時間ごとに有効期限切れトークンをクリーンアップ
        _cleanupTimer = new System.Timers.Timer(3600_000);
        _cleanupTimer.Elapsed += (_, _) => CleanupExpiredTokens();
        _cleanupTimer.AutoReset = true;
        _cleanupTimer.Start();
    }

    public record TokenInfo(string Username, bool IsAdmin, DateTimeOffset Expiry);

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
            // 有効期限チェック
            if (DateTimeOffset.UtcNow > info.Expiry)
            {
                _tokens.TryRemove(token, out _);
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
    }

    /// <summary>
    /// 有効期限切れのトークンを一括削除（メモリリーク対策）
    /// </summary>
    private static void CleanupExpiredTokens()
    {
        var now = DateTimeOffset.UtcNow;
        foreach (var kvp in _tokens)
        {
            if (now > kvp.Value.Expiry)
            {
                _tokens.TryRemove(kvp.Key, out _);
            }
        }
    }
}

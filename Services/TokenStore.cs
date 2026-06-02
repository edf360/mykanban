using System.Collections.Concurrent;

namespace KanbanServer.Services;

/// <summary>
/// 認証トークンの管理（メモリ上）
/// サーバー再起動で全トークン失効
/// </summary>
public class TokenStore
{
    private static readonly ConcurrentDictionary<string, TokenInfo> _tokens = new();

    public record TokenInfo(string Username, bool IsAdmin, DateTimeOffset Expiry);

    /// <summary>
    /// 新しいトークンを生成して保存
    /// 有効期限はデフォルト24時間
    /// </summary>
    public string CreateToken(string username, bool isAdmin, TimeSpan? expiry = null)
    {
        var token = Guid.NewGuid().ToString("N");
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
}

using System.Collections.Concurrent;

namespace KanbanServer.Services;

/// <summary>
/// 認証トークンの管理（メモリ上）
/// サーバー再起動で全トークン失効
/// </summary>
public class TokenStore
{
    private static readonly ConcurrentDictionary<string, TokenInfo> _tokens = new();

    public record TokenInfo(string Username, bool IsAdmin);

    /// <summary>
    /// 新しいトークンを生成して保存
    /// </summary>
    public string CreateToken(string username, bool isAdmin)
    {
        var token = Guid.NewGuid().ToString("N");
        _tokens[token] = new TokenInfo(username, isAdmin);
        return token;
    }

    /// <summary>
    /// トークンを検証してユーザー情報を取得
    /// </summary>
    public TokenInfo? ValidateToken(string token)
    {
        return _tokens.TryGetValue(token, out var info) ? info : null;
    }

    /// <summary>
    /// トークンを無効化（ログアウト）
    /// </summary>
    public void RevokeToken(string token)
    {
        _tokens.TryRemove(token, out _);
    }
}

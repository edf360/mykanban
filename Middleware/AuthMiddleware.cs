using KanbanServer.Services;

namespace KanbanServer.Middleware;

/// <summary>
/// 認証ミドルウェア
/// /api/auth/login は認証不要、それ以外のAPIはトークン検証
/// /api/settings の書き換えは管理者のみ
/// </summary>
public class AuthMiddleware
{
    private readonly RequestDelegate _next;
    private readonly TokenStore _tokenStore;

    public AuthMiddleware(RequestDelegate next, TokenStore tokenStore)
    {
        _next = next;
        _tokenStore = tokenStore;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.Value ?? "";

        // 認証エンドポイントはスキップ
        if (path == "/api/auth/login" || path == "/api/auth/login/")
        {
            await _next(context);
            return;
        }

        // 静的ファイルはスキップ
        if (!path.StartsWith("/api/"))
        {
            await _next(context);
            return;
        }

        // Authorizationヘッダーからトークンを取得
        var authHeader = context.Request.Headers["Authorization"].ToString();
        if (string.IsNullOrEmpty(authHeader) || !authHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Unauthorized\"}");
            return;
        }

        var token = authHeader["Bearer ".Length..].Trim();
        var info = _tokenStore.ValidateToken(token);

        if (info == null)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Invalid or expired token\"}");
            return;
        }

        // 管理者権限が必要なエンドポイントのチェック
        var isAdminRequired = IsAdminRequired(path, context.Request.Method);
        if (isAdminRequired && !info.IsAdmin)
        {
            context.Response.StatusCode = 403;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync("{\"error\":\"Admin access required\"}");
            return;
        }

        // ユーザー情報を次のミドルウェアに渡す
        context.Items["Username"] = info.Username;
        context.Items["IsAdmin"] = info.IsAdmin;

        await _next(context);
    }

    private static bool IsAdminRequired(string path, string method)
    {
        // 設定の書き換えは管理者のみ
        if (path.StartsWith("/api/settings"))
        {
            // GET は読み取りのみなので管理者不要
            if (method == "GET")
                return false;
            // PUT/POST/DELETE は管理者のみ
            return method is "PUT" or "POST" or "DELETE";
        }

        // チケットの削除は管理者のみ
        if (path.StartsWith("/api/tickets") && method == "DELETE")
        {
            return true;
        }

        return false;
    }
}

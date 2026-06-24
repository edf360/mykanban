using KanbanServer.Services;
using Serilog;

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
        try
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
                Log.Warning("認証ヘッダーがありません: Path={Path}, Method={Method}", path, context.Request.Method);
                await WriteJsonResponse(context, 401, "{\"error\":\"Unauthorized\"}");
                return;
            }

            var token = authHeader["Bearer ".Length..].Trim();
            var info = _tokenStore.ValidateToken(token);

            if (info == null)
            {
                Log.Warning("無効または期限切れのトークン: Path={Path}, Method={Method}", path, context.Request.Method);
                await WriteJsonResponse(context, 401, "{\"error\":\"Invalid or expired token\"}");
                return;
            }

            // 管理者権限が必要なエンドポイントのチェック
            var isAdminRequired = IsAdminRequired(path, context.Request.Method);
            if (isAdminRequired && !info.IsAdmin)
            {
                Log.Warning("管理者権限が必要です: User={User}, Path={Path}, Method={Method}", info.Username, path, context.Request.Method);
                await WriteJsonResponse(context, 403, "{\"error\":\"Admin access required\"}");
                return;
            }

            // ユーザー情報を次のミドルウェアに渡す
            context.Items["Username"] = info.Username;
            context.Items["IsAdmin"] = info.IsAdmin;

            await _next(context);
        }
        catch (Exception ex)
        {
            Log.Error(ex, "認証ミドルウェアで予期せぬエラーが発生しました: Path={Path}", context.Request.Path.Value);
            if (!context.Response.HasStarted)
            {
                await WriteJsonResponse(context, 500, "{\"error\":\"Internal server error\"}");
            }
        }
    }

    private static async Task WriteJsonResponse(HttpContext context, int statusCode, string json)
    {
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "application/json";
        await context.Response.WriteAsync(json);
    }

    private static bool IsAdminRequired(string path, string method)
    {
        // 設定系（パスセパレータを含む正確なマッチング）
        if (path.StartsWith("/api/settings/") || path == "/api/settings")
        {
            // GET は読み取りのみなので管理者不要
            if (method == "GET")
                return false;
            // インポート系は管理者のみ
            if (path.StartsWith("/api/settings/import"))
                return true;
            // PUT/POST/DELETE は一般ユーザーも可能（担当者追加・ラベル追加・エクスポートなど）
            return false;
        }

        return false;
    }
}

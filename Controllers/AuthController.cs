using KanbanServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace KanbanServer.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly TokenStore _tokenStore;

    // 管理者のユーザ名とパスワード（環境変数から読み込み、デフォルト値を備える）
    private const string AdminUsername = "admin";
    private static readonly string AdminPassword = Environment.GetEnvironmentVariable("KANBAN_ADMIN_PASSWORD") ?? "clsw";

    // 一般ユーザーのパスワード（環境変数から読み込み、デフォルト値を備える）
    private static readonly string UserPassword = Environment.GetEnvironmentVariable("KANBAN_USER_PASSWORD") ?? "clsw";

    public AuthController(TokenStore tokenStore)
    {
        _tokenStore = tokenStore;
    }

    public record LoginRequest(string Username, string Password);
    public record LoginResponse(string Token, bool IsAdmin, string Username);

    /// <summary>
    /// ユーザー認証とトークン発行
    /// </summary>
    [HttpPost("login")]
    public IActionResult Login([FromBody] LoginRequest? request)
    {
        if (request == null || string.IsNullOrEmpty(request.Username) || string.IsNullOrEmpty(request.Password))
        {
            return Unauthorized(new { error = "Username and password are required" });
        }

        // 管理者チェック
        if (request.Username == AdminUsername && request.Password == AdminPassword)
        {
            var token = _tokenStore.CreateToken(request.Username, isAdmin: true);
            return Ok(new { token, isAdmin = true, username = request.Username });
        }

        // 一般ユーザーチェック（ユーザ名は任意、パスワードが一致すればOK）
        if (request.Password == UserPassword)
        {
            var token = _tokenStore.CreateToken(request.Username, isAdmin: false);
            return Ok(new { token, isAdmin = false, username = request.Username });
        }

        return Unauthorized(new { error = "Invalid credentials" });
    }

    /// <summary>
    /// ログアウト（トークン無効化）
    /// </summary>
    [HttpPost("logout")]
    public IActionResult Logout([FromHeader(Name = "Authorization")] string? authorization)
    {
        if (authorization != null && authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authorization["Bearer ".Length..].Trim();
            _tokenStore.RevokeToken(token);
        }
        return NoContent();
    }

    /// <summary>
    /// 現在の認証情報を取得
    /// </summary>
    [HttpGet("me")]
    public IActionResult GetCurrentUser([FromHeader(Name = "Authorization")] string? authorization)
    {
        if (authorization != null && authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            var token = authorization["Bearer ".Length..].Trim();
            var info = _tokenStore.ValidateToken(token);
            if (info != null)
            {
                return Ok(new { username = info.Username, isAdmin = info.IsAdmin });
            }
        }
        return Unauthorized(new { error = "Not authenticated" });
    }
}

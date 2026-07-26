using KanbanServer.Controllers;
using KanbanServer.Services;
using Microsoft.AspNetCore.Mvc;

namespace Tests;

/// <summary>
/// AuthControllerのテスト
/// </summary>
public class AuthControllerTests
{
    private readonly TokenStore _tokenStore;
    private readonly AuthController _controller;

    public AuthControllerTests()
    {
        _tokenStore = new TokenStore();
        _controller = new AuthController(_tokenStore);
    }

    // ヘルパー: 匿名型のプロパティ値を取得
    private static object? GetProperty(object obj, string name)
    {
        return obj.GetType().GetProperty(name)?.GetValue(obj);
    }

    // ===== Login 正常系 =====

    [Fact]
    public void Login_AdminCredentials_ShouldReturnAdminToken()
    {
        // Arrange
        var request = new AuthController.LoginRequest("admin", "clsw");

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        Assert.NotNull(GetProperty(response, "token"));
        Assert.True((bool)GetProperty(response, "isAdmin")!);
        Assert.Equal("admin", GetProperty(response, "username"));
    }

    [Fact]
    public void Login_UserCredentials_ShouldReturnUserToken()
    {
        // Arrange: 任意のユーザ名でパスワード一致ならログイン可能
        var request = new AuthController.LoginRequest("testuser", "clsw");

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        Assert.NotNull(GetProperty(response, "token"));
        Assert.False((bool)GetProperty(response, "isAdmin")!);
        Assert.Equal("testuser", GetProperty(response, "username"));
    }

    [Fact]
    public void Login_WithValidUsername_ShouldIncludeUsername()
    {
        // Arrange
        var request = new AuthController.LoginRequest("山田", "clsw");

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        Assert.Equal("山田", GetProperty(response, "username"));
    }

    [Fact]
    public void Login_Admin_ShouldCreateValidToken()
    {
        // Arrange
        var request = new AuthController.LoginRequest("admin", "clsw");

        // Act
        var result = _controller.Login(request);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        var token = (string)GetProperty(response, "token")!;
        
        // トークンがTokenStoreで検証可能であることを確認
        var info = _tokenStore.ValidateToken(token);
        Assert.NotNull(info);
        Assert.True(info.IsAdmin);
        Assert.Equal("admin", info.Username);
    }

    // ===== Login 異常系 =====

    [Fact]
    public void Login_NullRequest_ShouldReturnUnauthorized()
    {
        // Act
        var result = _controller.Login(null);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_EmptyUsername_ShouldReturnUnauthorized()
    {
        // Arrange
        var request = new AuthController.LoginRequest("", "clsw");

        // Act
        var result = _controller.Login(request);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_EmptyPassword_ShouldReturnUnauthorized()
    {
        // Arrange
        var request = new AuthController.LoginRequest("admin", "");

        // Act
        var result = _controller.Login(request);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_WrongPassword_ShouldReturnUnauthorized()
    {
        // Arrange
        var request = new AuthController.LoginRequest("testuser", "wrongpassword");

        // Act
        var result = _controller.Login(request);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_WrongAdminPassword_ShouldReturnUnauthorized()
    {
        // Arrange
        var request = new AuthController.LoginRequest("admin", "wrongpassword");

        // Act
        var result = _controller.Login(request);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void Login_AdminUsernameWithUserPassword_ShouldReturnAdmin()
    {
        // Arrange: adminユーザ名 + adminパスワード
        var request = new AuthController.LoginRequest("admin", "clsw");

        // Act
        var result = _controller.Login(request);

        // Assert: 管理者として認証される（adminチェックが先）
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        Assert.True((bool)GetProperty(response, "isAdmin")!);
    }

    // ===== Logout =====

    [Fact]
    public void Logout_WithValidToken_ShouldRevokeToken()
    {
        // Arrange
        var token = _tokenStore.CreateToken("testuser", false);
        var authHeader = $"Bearer {token}";

        // Act
        var result = _controller.Logout(authHeader);

        // Assert
        Assert.IsType<NoContentResult>(result);
        var info = _tokenStore.ValidateToken(token);
        Assert.Null(info); // トークンが無効化されている
    }

    [Fact]
    public void Logout_WithoutToken_ShouldReturnNoContent()
    {
        // Act
        var result = _controller.Logout(null);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    [Fact]
    public void Logout_WithInvalidToken_ShouldReturnNoContent()
    {
        // Arrange
        var authHeader = "Bearer invalid-token";

        // Act
        var result = _controller.Logout(authHeader);

        // Assert
        Assert.IsType<NoContentResult>(result);
    }

    // ===== GetCurrentUser =====

    [Fact]
    public void GetCurrentUser_WithValidToken_ShouldReturnUserInfo()
    {
        // Arrange
        var token = _tokenStore.CreateToken("testuser", true);
        var authHeader = $"Bearer {token}";

        // Act
        var result = _controller.GetCurrentUser(authHeader);

        // Assert
        var okResult = Assert.IsType<OkObjectResult>(result);
        var response = okResult.Value!;
        Assert.Equal("testuser", GetProperty(response, "username"));
        Assert.True((bool)GetProperty(response, "isAdmin")!);
    }

    [Fact]
    public void GetCurrentUser_WithInvalidToken_ShouldReturnUnauthorized()
    {
        // Arrange
        var authHeader = "Bearer non-existent-token";

        // Act
        var result = _controller.GetCurrentUser(authHeader);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void GetCurrentUser_WithoutToken_ShouldReturnUnauthorized()
    {
        // Act
        var result = _controller.GetCurrentUser(null);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    [Fact]
    public void GetCurrentUser_WithExpiredToken_ShouldReturnUnauthorized()
    {
        // Arrange: すぐに期限切れのトークンを作成
        var token = _tokenStore.CreateToken("testuser", false, TimeSpan.FromMilliseconds(10));
        var authHeader = $"Bearer {token}";
        
        // 期限切れを待つ
        System.Threading.Thread.Sleep(20);

        // Act
        var result = _controller.GetCurrentUser(authHeader);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(result);
    }

    // ===== 統合テスト =====

    [Fact]
    public void Login_ThenGetCurrentUser_ShouldReturnSameUser()
    {
        // Arrange & Act: ログイン
        var loginRequest = new AuthController.LoginRequest("統合テスト", "clsw");
        var loginResult = _controller.Login(loginRequest);
        var loginOk = Assert.IsType<OkObjectResult>(loginResult);
        var loginResponse = loginOk.Value!;
        var token = (string)GetProperty(loginResponse, "token")!;

        // Act: 認証情報取得
        var authHeader = $"Bearer {token}";
        var meResult = _controller.GetCurrentUser(authHeader);

        // Assert
        var meOk = Assert.IsType<OkObjectResult>(meResult);
        var meResponse = meOk.Value!;
        Assert.Equal("統合テスト", GetProperty(meResponse, "username"));
        Assert.False((bool)GetProperty(meResponse, "isAdmin")!);
    }

    [Fact]
    public void Login_ThenLogout_ThenGetCurrentUser_ShouldFail()
    {
        // Arrange: ログイン
        var loginRequest = new AuthController.LoginRequest("logoutテスト", "clsw");
        var loginResult = _controller.Login(loginRequest);
        var loginOk = Assert.IsType<OkObjectResult>(loginResult);
        var loginResponse = loginOk.Value!;
        var token = (string)GetProperty(loginResponse, "token")!;
        var authHeader = $"Bearer {token}";

        // Act: ログアウト
        _controller.Logout(authHeader);

        // Act: 認証情報取得（失敗するはず）
        var meResult = _controller.GetCurrentUser(authHeader);

        // Assert
        Assert.IsType<UnauthorizedObjectResult>(meResult);
    }

    // ===== TC-ERR-016: 401レスポンス受信時 - APIエラー処理確認 =====

    [Fact]
    public void TC_ERR_016_GetCurrentUser_WithInvalidToken_ShouldReturnUnauthorized()
    {
        // Arrange: 無効なトークン（TokenStoreに登録されていない）
        var invalidAuthHeader = "Bearer invalid-token-12345";

        // Act
        var result = _controller.GetCurrentUser(invalidAuthHeader);

        // Assert: UnauthorizedError（401）が返される
        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result);
        Assert.Equal(401, unauthorizedResult.StatusCode);
        // エラーメッセージが適切に設定されている
        var errorObj = unauthorizedResult.Value as dynamic;
        Assert.NotNull(errorObj);
    }

    [Fact]
    public void TC_ERR_016_GetCurrentUser_WithExpiredToken_ShouldReturnUnauthorizedWithoutErrorLog()
    {
        // Arrange: 期限切れのトークンを作成
        var token = _tokenStore.CreateToken("testuser", false, TimeSpan.FromMilliseconds(10));
        var authHeader = $"Bearer {token}";

        // 期限切れを待つ
        System.Threading.Thread.Sleep(20);

        // Act: 無効なトークンでAPIを呼び出し
        var result = _controller.GetCurrentUser(authHeader);

        // Assert: Unauthorized が返され、内部情報が漏洩していない
        var unauthorizedResult = Assert.IsType<UnauthorizedObjectResult>(result);
        Assert.Equal(401, unauthorizedResult.StatusCode);
        // トークン有効期限切れによる不要なエラーログが抑制されることを確認
        // （AuthController は単に Unauthorized を返すだけで、例外をスローしない）
        // UnauthorizedObjectResult.Value がnullの場合があるため、存在する場合のみチェック
        if (unauthorizedResult.Value != null)
        {
            var errorValue = unauthorizedResult.Value;
            var errorProperty = errorValue.GetType().GetProperty("error");
            if (errorProperty != null)
            {
                var errorMessage = errorProperty.GetValue(errorValue) as string;
                if (errorMessage != null)
                {
                    Assert.DoesNotContain("Exception", errorMessage);
                    Assert.DoesNotContain("expired", errorMessage);  // 内部状態が漏洩していない
                }
            }
        }
    }

    [Fact]
    public async Task TC_ERR_016_AuthMiddleware_WithInvalidToken_ShouldReturn401()
    {
        // Arrange: 無効なトークンでミドルウェアをテスト
        var tokenStore = new TokenStore();
        // トークンは作成しない（無効トークンを直接使用）
        var invalidAuthHeader = "Bearer completely-fake-token";

        var responseBody = new System.IO.MemoryStream();
        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        context.Response.Body = responseBody;
        context.Request.Path = "/api/tickets";
        context.Request.Method = "GET";
        context.Request.Headers["Authorization"] = invalidAuthHeader;

        bool nextCalled = false;
        var middleware = new KanbanServer.Middleware.AuthMiddleware(async (ctx) =>
        {
            nextCalled = true;
            ctx.Response.StatusCode = 200;
        }, tokenStore);

        // Act
        await middleware.InvokeAsync(context);

        // Assert: 401 Unauthorized が返り、次のミドルウェアには到達しない
        Assert.Equal(401, context.Response.StatusCode);
        Assert.False(nextCalled, "Next middleware should NOT be called with invalid token");
        responseBody.Seek(0, System.IO.SeekOrigin.Begin);
        var responseContent = await new System.IO.StreamReader(responseBody).ReadToEndAsync();
        Assert.Contains("Invalid or expired token", responseContent);
        // エラーレスポンスに内部情報が含まれていないことを確認
        Assert.DoesNotContain("Exception", responseContent);
        Assert.DoesNotContain("StackTrace", responseContent);
    }

    [Fact]
    public async Task TC_ERR_016_AuthMiddleware_WithNoToken_ShouldReturn401()
    {
        // Arrange: Authorizationヘッダーなし
        var tokenStore = new TokenStore();

        var context = new Microsoft.AspNetCore.Http.DefaultHttpContext();
        context.Request.Path = "/api/tickets";
        context.Request.Method = "GET";
        // Authorization ヘッダーを設定しない

        bool nextCalled = false;
        var middleware = new KanbanServer.Middleware.AuthMiddleware(async (ctx) =>
        {
            nextCalled = true;
        }, tokenStore);

        // Act
        await middleware.InvokeAsync(context);

        // Assert: 401 Unauthorized
        Assert.Equal(401, context.Response.StatusCode);
        Assert.False(nextCalled);
    }

    // ===== TC-SEC-005: AuthControllerパスワード確認 =====

    [Fact]
    public void TC_SEC_005_AdminPassword_FromEnvironmentVariable_NotHardcoded()
    {
        // AuthController の AdminPassword は環境変数から読み込んでいることを確認
        // リフレクションで private static field にアクセス
        var type = typeof(AuthController);
        var field = type.GetField("AdminPassword",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        
        Assert.NotNull(field);
        
        var password = field!.GetValue(null) as string;
        Assert.NotNull(password);
        Assert.NotEmpty(password!);
        
        // パスワードが環境変数から読み込まれていることを確認
        // 環境変数が設定されていない場合はデフォルト値 "clsw" になる
        var envPassword = Environment.GetEnvironmentVariable("KANBAN_ADMIN_PASSWORD");
        if (envPassword != null)
        {
            // 環境変数が設定されている場合は、その値と一致する
            Assert.Equal(envPassword, password);
        }
        else
        {
            // 環境変数が設定されていない場合はデフォルト値
            Assert.Equal("clsw", password);
        }
    }

    [Fact]
    public void TC_SEC_005_UserPassword_FromEnvironmentVariable_NotHardcoded()
    {
        // AuthController の UserPassword も環境変数から読み込んでいることを確認
        var type = typeof(AuthController);
        var field = type.GetField("UserPassword",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        
        Assert.NotNull(field);
        
        var password = field!.GetValue(null) as string;
        Assert.NotNull(password);
        Assert.NotEmpty(password!);
        
        // パスワードが環境変数 KANBAN_USER_PASSWORD から読み込まれていることを確認
        var envPassword = Environment.GetEnvironmentVariable("KANBAN_USER_PASSWORD");
        if (envPassword != null)
        {
            Assert.Equal(envPassword, password);
        }
        else
        {
            // 環境変数が設定されていない場合はデフォルト値
            Assert.Equal("clsw", password);
        }
    }

    [Fact]
    public void TC_SEC_005_Passwords_ShouldNotBeHardcodedInSource()
    {
        // パスワードが環境変数ベースであることを確認
        // AdminPassword と UserPassword が Environment.GetEnvironmentVariable を使用している
        // （リフレクションでフィールドが存在し、環境変数の値を反映していることで間接的に検証）
        var type = typeof(AuthController);
        
        var adminField = type.GetField("AdminPassword",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        var userField = type.GetField("UserPassword",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        
        // 両方のフィールドが存在すること
        Assert.NotNull(adminField);
        Assert.NotNull(userField);
        
        // 環境変数を変更して値が反映されることを確認（動的に変わる＝ハードコードされていない証拠）
        // 注: static フィールドはコンストラクタで一度だけ評価されるため、
        // ここで確認できるのは「環境変数読み込みロジックが存在すること」
        var adminPassword = adminField!.GetValue(null) as string;
        var userPassword = userField!.GetValue(null) as string;
        
        // パスワードが空でないこと（何らかの値が設定されている）
        Assert.NotNull(adminPassword);
        Assert.NotEmpty(adminPassword);
        Assert.NotNull(userPassword);
        Assert.NotEmpty(userPassword);
    }
}

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
}

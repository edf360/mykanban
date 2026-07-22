using System.Text.Json.Serialization;
using System.Text.Json;
using System.Globalization;
using KanbanServer.Data;
using KanbanServer.Hubs;
using KanbanServer.Middleware;
using KanbanServer.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog設定 - ファイルログ出力を追加（ログパスは設定ファイルから取得）
var logPath = builder.Configuration.GetValue<string>("LogPath")
    ?? Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs", "kanban.log");
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File(
        path: logPath,
        rollingInterval: RollingInterval.Day,
        retainedFileCountLimit: 7,
        outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}")
    .CreateBootstrapLogger();

builder.Host.UseSerilog();

// SQLiteデータベース設定
builder.Services.AddDbContext<KanbanDbContext>(options =>
    options.UseSqlite("Data Source=kanban.db"));

// トークンストア（認証用）
builder.Services.AddSingleton<TokenStore>();

// チケットサービス
builder.Services.AddScoped<TicketService>();

// 【BUG-10修正】CORS設定：メソッド/ヘッダーを制限しつつ、LAN内からのアクセスも許可
// WithOrigins は厳格なオリジンチェックを行うが、LANアクセス時はブラウザがOriginを送信しない場合がある
// そのため、AllowAnyOrigin() を使用しつつ、メソッドとヘッダーは制限する
builder.Services.AddCors(options =>
{
    options.AddPolicy("RestrictedPolicy", policy =>
    {
        policy.AllowAnyOrigin()
              .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
              .WithHeaders("Content-Type", "Authorization", "Accept");
    });
});

// コントローラーとJSONシリアライザー設定
// DateTimeをオフセット付きでシリアライズ（JS側で正しくローカル時間に変換されるように）
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.WriteIndented = true;
        options.JsonSerializerOptions.Converters.Add(new LocalDateTimeConverter());
    });

// SignalR設定 - CORSを有効化
builder.Services.AddSignalR(options =>
{
    options.EnableDetailedErrors = false;
});

var app = builder.Build();

// 【BUG-10修正】制限付きCORSポリシーを適用
app.UseCors("RestrictedPolicy");

// 2. wwwrootからの静的ファイル配信（APIの前に配置）
var wwwRootPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
if (Directory.Exists(wwwRootPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(wwwRootPath),
        RequestPath = "",  // ルートから直接配信
        OnPrepareResponse = context =>
        {
            // キャッシュを無効化して、常に最新のファイルを取得する
            context.Context.Response.Headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0";
            context.Context.Response.Headers["Pragma"] = "no-cache";
            context.Context.Response.Headers["Expires"] = "0";
        }
    });
}

// 3. 認証ミドルウェア
app.UseMiddleware<AuthMiddleware>();

// 4. SQLite DB自動作成
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<KanbanDbContext>();
    db.Database.EnsureCreated();
}

// 5. APIルートをマップ（/api/プレフィックスのみ）
app.MapControllers();

// 6. SignalR Hub をマップ（グローバルCORSが適用される）
app.MapHub<TicketHub>("/ticketHub");

// 7. SPAフォールバック - API以外のすべてのリクエストでkanban.htmlを返す
app.MapFallback(async context =>
{
    var filePath = Path.Combine(wwwRootPath, "kanban.html");
    if (File.Exists(filePath))
    {
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.SendFileAsync(filePath);
    }
    else
    {
        context.Response.StatusCode = 404;
    }
});

// アプリケーション終了時にリソースをクリーンアップ
using var cancellationRegistration = app.Services.GetRequiredService<IHostApplicationLifetime>().ApplicationStopping.Register(() =>
{
    TokenStore.Cleanup();
});

app.Run();

/// <summary>
/// DateTimeをローカル時間のオフセット付きでシリアライズするコンバーター
/// </summary>
public class LocalDateTimeConverter : JsonConverter<DateTime>
{
    public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        => reader.GetDateTime();

    public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
    {
        // 【BUG-17修正】DateTime.Kindに応じて適切に処理
        string result;
        switch (value.Kind)
        {
            case DateTimeKind.Local:
                // ローカル時間：オフセットを付与
                result = value.ToString("yyyy-MM-ddTHH:mm:sszzz", CultureInfo.InvariantCulture);
                break;
            case DateTimeKind.Utc:
                // UTC時間：Zサフィックスを付与
                result = value.ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);
                break;
            case DateTimeKind.Unspecified:
            default:
                // 未指定：ローカル時間として扱う（既存動作維持）
                result = value.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);
                break;
        }
        writer.WriteStringValue(result);
    }
}

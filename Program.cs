using KanbanServer.Data;
using KanbanServer.Middleware;
using KanbanServer.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog設定 - ファイルログ出力を追加
Log.Logger = new LoggerConfiguration()
    .WriteTo.Console()
    .WriteTo.File(
        path: Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "logs", "kanban.log"),
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

// CORS設定（開発環境のみ開放的設定）
builder.Services.AddCors(options =>
{
    if (builder.Environment.IsDevelopment())
    {
        options.AddPolicy("AllowAll", policy =>
        {
            policy.AllowAnyOrigin()
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        });
    }
    else
    {
        // 本番環境では同じオリジンのみ許可（SPAとAPIが同じドメインの場合）
        options.AddPolicy("SameOrigin", policy =>
        {
            policy.WithOrigins(builder.Configuration.GetValue<string>("AllowedOrigin") ?? "")
                  .AllowAnyMethod()
                  .AllowAnyHeader();
        });
    }
});

// コントローラーとJSONシリアライザー設定
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.WriteIndented = true;
    });

var app = builder.Build();

// 1. CORSを有効化
app.UseCors(builder.Environment.IsDevelopment() ? "AllowAll" : "SameOrigin");

// 2. wwwrootからの静的ファイル配信（APIの前に配置）
var wwwRootPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "wwwroot");
if (Directory.Exists(wwwRootPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(wwwRootPath),
        RequestPath = ""  // ルートから直接配信
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

// 6. SPAフォールバック - API以外のすべてのリクエストでkanban.htmlを返す
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

app.Run();

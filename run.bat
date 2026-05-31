@echo off
chcp 65001 >nul

:: バッチファイルのあるディレクトリに移動
cd /d "%~dp0"

echo ================================
echo   Kanban Server を起動中...
echo ================================
echo.
echo   サーバー起動後、以下のURLでアクセスできます:
echo.
echo   ブラウザでアクセス:
echo   http://localhost:5000/kanban.html
echo.
echo   API エンドポイント:
echo   http://localhost:5000/api/tickets
echo.
echo   Ctrl+C で終了できます
echo ================================
echo.

:: .NET Runtime チェック
echo [.NET Runtime を確認中...]
where dotnet >nul 2>&1
if %errorlevel% neq 0 (
    echo [エラー] .NET Runtime がインストールされていません
    echo.
    echo .NET Desktop Runtimeをインストールしますか？[Y/N]
    set /p choice=
    if /i "%choice%"=="Y" (
        start https://dotnet.microsoft.com/download/dotnet
        echo ブラウザで.NET Runtimeをダウンロードしてインストールしてください。
        echo インストール後、このバッチファイルを再度実行してください。
        pause
        exit /b 1
    ) else (
        echo .NET Runtimeが必要です。インストールしてください。
        pause
        exit /b 1
    )
) else (
    echo [OK] .NET Runtime が見つかりました
    echo.
)

:: サーバー起動
dotnet run

pause

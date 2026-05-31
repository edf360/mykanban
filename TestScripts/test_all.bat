@echo off
setlocal EnableDelayedExpansion
REM Kanban Server 全テスト実行バッチファイル
REM 使用方法: test_all.bat
chcp 65001 >nul 2>&1

echo ==========================================
echo  Kanban Server 全テスト実行
echo ==========================================
echo.

REM [1] xUnit ユニットテスト
echo [1/2] xUnit ユニットテストを実行中...
cd /d "%~dp0.."
cd Tests
dotnet test --verbosity normal --nologo
if !ERRORLEVEL! NEQ 0 (
    echo xUnit テストで失敗が発生しました
    pause
    exit /b 1
)
echo.

cd /d "%~dp0.."

REM [2] サーバー起動 & API統合テスト
echo [2/2] API 統合テストを実行中...

REM テスト用データベースを削除
del /q kanban.db kanban.db-shm kanban.db-wal 2>nul

REM サーバーをバックグラウンドで起動
echo サーバーを起動中...
start /B dotnet run > %TEMP%\kanban_server.log 2>&1

REM サーバーが準備できるまで待機（最大30秒）
echo サーバーの準備を待機中...
set SERVER_READY=0
for /l %%i in (1,1,30) do (
    curl -s --connect-timeout 2 http://localhost:5000/api/tickets >nul 2>&1
    if !ERRORLEVEL! EQU 0 (
        echo サーバーが起動しました (http://localhost:5000)
        set SERVER_READY=1
        goto :server_started
    )
    timeout /t 1 /nobreak >nul
)

:server_started
if !SERVER_READY! EQU 0 (
    echo サーバー起動に失敗しました（タイムアウト）
    type %TEMP%\kanban_server.log
    pause
    exit /b 1
)

echo.

REM API統合テストを実行（Git Bashがあれば使用、なければcurlで簡易テスト）
where git >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    bash "%~dp0test_api.sh" http://localhost:5000
) else (
    call :simple_api_test
)

if !ERRORLEVEL! NEQ 0 (
    echo API 統合テストで失敗が発生しました
) else (
    echo.
    echo ==========================================
    echo  すべてのテストが通過しました!
    echo ==========================================
)

REM サーバー停止
echo.
echo [クリーンアップ]
taskkill /F /IM KanbanServer.exe 2>nul
taskkill /F /IM dotnet.exe 2>nul
del /q kanban.db kanban.db-shm kanban.db-wal 2>nul
echo テストデータをクリーンアップしました。

pause
exit /b 0

:simple_api_test
echo --- シンプルAPIテスト（Git Bash未検出）---

REM チケット作成
curl -s -X POST http://localhost:5000/api/tickets ^
    -H "Content-Type: application/json" ^
    -d "{\"title\":\"テストチケット\",\"column\":\"todo\",\"labels\":[\"重要\"],\"childTasks\":[{\"text\":\"タスク1\",\"done\":false}]}" ^
    > %TEMP%\kanban_response.json

findstr /C:"テストチケット" %TEMP%\kanban_response.json >nul
if !ERRORLEVEL! EQU 0 (
    echo ✓ チケット作成成功
) else (
    echo ✗ チケット作成失敗
    exit /b 1
)

REM チケット一覧取得
curl -s http://localhost:5000/api/tickets > %TEMP%\kanban_response.json
findstr /C:"テストチケット" %TEMP%\kanban_response.json >nul
if !ERRORLEVEL! EQU 0 (
    echo ✓ チケット一覧取得成功
) else (
    echo ✗ チケット一覧取得失敗
    exit /b 1
)

REM 静的ファイル配信確認
curl -s http://localhost:5000/ > %TEMP%\kanban_response.html
findstr /C:"DOCTYPE html" %TEMP%\kanban_response.html >nul
if !ERRORLEVEL! EQU 0 (
    echo ✓ 静的ファイル配信成功
) else (
    echo ✗ 静的ファイル配信失敗
    exit /b 1
)

del /q %TEMP%\kanban_response.json %TEMP%\kanban_response.html 2>nul
exit /b 0

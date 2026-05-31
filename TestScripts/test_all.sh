#!/bin/bash
# Kanban Server 全テスト実行スクリプト
# 使用方法: ./test_all.sh
#   - xUnitユニットテストを実行
#   - サーバーを自動起動し、API統合テストを実行
#   - 最後にサーバーを停止

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$(dirname "$SCRIPT_DIR")"
TMPDIR="$SERVER_DIR/.test_tmp"
mkdir -p "$TMPDIR"
BASE_URL="http://localhost:5000"
SERVER_PID=""

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

cleanup() {
    echo ""
    echo -e "${BLUE}[クリーンアップ]${NC}"
    if [ -n "$SERVER_PID" ]; then
        echo "サーバープロセス (PID: $SERVER_PID) を停止中..."
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
        echo "サーバーを停止しました。"
    fi
    # テスト用データベースを削除
    rm -f "$SERVER_DIR/kanban.db" "$SERVER_DIR/kanban.db-shm" "$SERVER_DIR/kanban.db-wal"
    echo "テストデータをクリーンアップしました。"
}

trap cleanup EXIT

echo "=========================================="
echo " Kanban Server 全テスト実行"
echo "=========================================="
echo ""

########################################
# [1] xUnit ユニットテスト
########################################
echo -e "${YELLOW}[1/2] xUnit ユニットテストを実行中...${NC}"
cd "$SERVER_DIR/Tests"

if dotnet test --verbosity normal --nologo 2>&1; then
    echo -e "${GREEN}✓ xUnit テスト完了${NC}"
else
    echo -e "${RED}✗ xUnit テストで失敗が発生しました${NC}"
    exit 1
fi

echo ""
cd "$SERVER_DIR"

########################################
# [2] サーバー起動 & API統合テスト
########################################
echo -e "${YELLOW}[2/2] API 統合テストを実行中...${NC}"

# テスト用データベースを削除
rm -f "$SERVER_DIR/kanban.db" "$SERVER_DIR/kanban.db-shm" "$SERVER_DIR/kanban.db-wal"

# サーバーをバックグラウンドで起動
echo "サーバーを起動中..."
cd "$SERVER_DIR"
dotnet run > "$TMPDIR/kanban_server.log" 2>&1 &
SERVER_PID=$!
echo "サーバー PID: $SERVER_PID"

# サーバーが準備できるまで待機（最大30秒）
echo "サーバーの準備を待機中..."
for i in $(seq 1 30); do
    if curl -s --connect-timeout 2 "$BASE_URL/api/tickets" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ サーバーが起動しました (http://localhost:5000)${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}✗ サーバー起動に失敗しました（タイムアウト）${NC}"
        cat "$TMPDIR/kanban_server.log"
        exit 1
    fi
    sleep 1
done

echo ""

# API統合テストを実行
bash "$SCRIPT_DIR/test_api.sh" "$BASE_URL"
TEST_RESULT=$?

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}✓ API 統合テスト完了${NC}"
else
    echo -e "${RED}✗ API 統合テストで失敗が発生しました${NC}"
    exit 1
fi

echo ""
echo "=========================================="
echo -e "${GREEN} すべてのテストが通過しました! ${GREEN}"
echo "=========================================="

# cleanup は trap で自動実行される
exit 0

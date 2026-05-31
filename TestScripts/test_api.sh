#!/bin/bash
# Kanban Server API Integration Test Script
# 使用方法: ./test_api.sh [BASE_URL]
#   デフォルト: http://localhost:5000

set -e

BASE_URL="${1:-http://localhost:5000}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMPDIR="$SCRIPT_DIR/.test_tmp"
mkdir -p "$TMPDIR"
PASSED=0
FAILED=0
TOTAL=0

# カラー出力
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# テスト結果表示
pass_test() {
    TOTAL=$((TOTAL + 1))
    PASSED=$((PASSED + 1))
    echo -e "  ${GREEN}✓${NC} $1"
}

fail_test() {
    TOTAL=$((TOTAL + 1))
    FAILED=$((FAILED + 1))
    echo -e "  ${RED}✗${NC} $1"
    if [ -n "$2" ]; then
        echo -e "      期待: $2"
        echo -e "      実際: $3"
    fi
}

assert_status() {
    local response="$1"
    local expected_status="$2"
    local test_name="$3"
    local actual_status
    actual_status=$(echo "$response" | head -1)
    
    if [ "$actual_status" = "$expected_status" ]; then
        pass_test "$test_name"
    else
        fail_test "$test_name" "$expected_status" "$actual_status"
    fi
}

assert_contains() {
    local body="$1"
    local expected="$2"
    local test_name="$3"
    
    if echo "$body" | grep -q "$expected"; then
        pass_test "$test_name"
    else
        fail_test "$test_name" "レスポンスに '$expected' を含むこと" "見つからなかった"
    fi
}

assert_json_field() {
    local body="$1"
    local field="$2"
    local expected="$3"
    local test_name="$4"
    
    # jq が利用できない場合は grep で代替
    if command -v jq &> /dev/null; then
        local actual
        actual=$(echo "$body" | jq -r "$field" 2>/dev/null)
        if [ "$actual" = "$expected" ]; then
            pass_test "$test_name"
        else
            fail_test "$test_name" "$expected" "$actual"
        fi
    else
        # シンプルな文字列マッチングフォールバック
        local escaped_expected
        escaped_expected=$(echo "$expected" | sed 's/[.[\*^$()+?{|\\]/\\&/g')
        if echo "$body" | grep -q "$escaped_expected"; then
            pass_test "$test_name"
        else
            fail_test "$test_name" "フィールドに '$expected' を含むこと" "見つからなかった"
        fi
    fi
}

# curlヘルパー - ステータスコードとボディを返す
curl_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    
    if [ -n "$data" ]; then
        curl -s -o "$TMPDIR/kanban_test_body.json" -w "%{http_code}" -X "$method" "$url" \
            -H "Content-Type: application/json" -d "$data"
    else
        curl -s -o "$TMPDIR/kanban_test_body.json" -w "%{http_code}" -X "$method" "$url"
    fi
}

echo "=========================================="
echo " Kanban Server API Integration Tests"
echo " Target: $BASE_URL"
echo "=========================================="
echo ""

# サーバー接続確認
echo -n "サーバー接続確認中... "
if curl -s --connect-timeout 3 "$BASE_URL/api/tickets" > /dev/null 2>&1; then
    echo -e "${GREEN}OK${NC}"
else
    echo -e "${RED}失敗 - サーバーが起動していない可能性があります${NC}"
    exit 1
fi
echo ""

# 保存用変数
TICKET_ID_1=""
TICKET_ID_2=""
TICKET_ID_3=""

########################################
echo "--- [1] 静的ファイル配信テスト ---"
########################################

STATUS=$(curl -s -o "$TMPDIR/kanban_test_body.html" -w "%{http_code}" "$BASE_URL/")
if [ "$STATUS" = "200" ]; then
    pass_test "GET / は 200 を返す"
else
    fail_test "GET / は 200 を返す" "200" "$STATUS"
fi

FILE_SIZE=$(wc -c < "$TMPDIR/kanban_test_body.html" 2>/dev/null || echo 0)
if [ "$FILE_SIZE" -gt 1000 ]; then
    pass_test "HTMLファイルは適切なサイズ (${FILE_SIZE} bytes)"
else
    fail_test "HTMLファイルは適切なサイズ" "> 1000 bytes" "${FILE_SIZE} bytes"
fi

echo ""

########################################
echo "--- [2] GET /api/tickets - チケット一覧取得 ---"
########################################

STATUS=$(curl_request GET "$BASE_URL/api/tickets")
assert_status "$STATUS" "200" "GET /api/tickets は 200 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")
# 空配列または配列形式か確認
if echo "$BODY" | grep -qE '^\s*\['; then
    pass_test "レスポンスは配列形式"
else
    fail_test "レスポンスは配列形式" "配列で始まること" "$BODY"
fi

echo ""

########################################
echo "--- [3] POST /api/tickets - 新規チケット作成 ---"
########################################

# チケット1を作成
STATUS=$(curl_request POST "$BASE_URL/api/tickets" '{"title":"テストチケットA","column":"todo","labels":["重要","フロントエンド"],"memo":"メモ内容","childTasks":[{"text":"子タスク1","done":false},{"text":"子タスク2","done":true}]}')
assert_status "$STATUS" "201" "POST /api/tickets は 201 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")

# jqがあればTicketIdを抽出、なければgrepで代替
if command -v jq &> /dev/null; then
    TICKET_ID_1=$(echo "$BODY" | jq -r '.ticketId')
else
    TICKET_ID_1=$(echo "$BODY" | grep -o '"ticketId": *"[^"]*"' | head -1 | cut -d'"' -f4)
fi

assert_contains "$BODY" "テストチケットA" "タイトルが正しい"
assert_json_field "$BODY" '.column' "todo" "カラムが todo"

# labels が配列として返ってくるか確認
if echo "$BODY" | grep -q '"labels"'; then
    if echo "$BODY" | grep -q '重要'; then
        pass_test "labels は配列としてシリアライズされている"
    else
        fail_test "labels に値が含まれていること" "重要" "見つからなかった"
    fi
else
    fail_test "labels プロパティが存在すること" "labels" "存在しない"
fi

# childTasks が配列として返ってくるか確認
if echo "$BODY" | grep -q '"childTasks"'; then
    if echo "$BODY" | grep -q '子タスク1'; then
        pass_test "childTasks は配列としてシリアライズされている"
    else
        fail_test "childTasks に値が含まれていること" "子タスク1" "見つからなかった"
    fi
else
    fail_test "childTasks プロパティが存在すること" "childTasks" "存在しない"
fi

# チケット2を作成（doingカラム）
STATUS=$(curl_request POST "$BASE_URL/api/tickets" '{"title":"テストチケットB","column":"doing"}')
assert_status "$STATUS" "201" "POST /api/tickets (チケット2) は 201 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")

if command -v jq &> /dev/null; then
    TICKET_ID_2=$(echo "$BODY" | jq -r '.ticketId')
else
    TICKET_ID_2=$(echo "$BODY" | grep -o '"ticketId": *"[^"]*"' | head -1 | cut -d'"' -f4)
fi

# チケット3を作成（todoカラム）
STATUS=$(curl_request POST "$BASE_URL/api/tickets" '{"title":"テストチケットC","column":"todo"}')
assert_status "$STATUS" "201" "POST /api/tickets (チケット3) は 201 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")

if command -v jq &> /dev/null; then
    TICKET_ID_3=$(echo "$BODY" | jq -r '.ticketId')
else
    TICKET_ID_3=$(echo "$BODY" | grep -o '"ticketId": *"[^"]*"' | head -1 | cut -d'"' -f4)
fi

echo ""

########################################
echo "--- [4] GET /api/tickets - 作成後の一覧確認 ---"
########################################

STATUS=$(curl_request GET "$BASE_URL/api/tickets")
assert_status "$STATUS" "200" "GET /api/tickets は 200 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")
if echo "$BODY" | grep -q "テストチケットA"; then
    pass_test "一覧にテストチケットAが含まれる"
else
    fail_test "一覧にテストチケットAが含まれること" "テストチケットA" "見つからなかった"
fi

echo ""

########################################
echo "--- [5] PUT /api/tickets/{id} - チケット完全更新 ---"
########################################

STATUS=$(curl_request PUT "$BASE_URL/api/tickets/$TICKET_ID_1" '{"title":"更新済みタイトル","column":"todo","labels":["バックエンド"],"memo":"更新メモ","childTasks":[{"text":"新しいタスク","done":false}]}')
assert_status "$STATUS" "200" "PUT /api/tickets/{id} は 200 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")
assert_contains "$BODY" "更新済みタイトル" "タイトルが更新されている"
assert_json_field "$BODY" '.column' "todo" "カラムは維持されている"

echo ""

########################################
echo "--- [6] PATCH /api/tickets/{id}/column - カラム移動 ---"
########################################

# チケット1を doing に移動
STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_1/column" '{"column":"doing"}')
assert_status "$STATUS" "204" "PATCH /api/tickets/{id}/column は 204 を返す"

# 移動後の確認
STATUS=$(curl_request GET "$BASE_URL/api/tickets")
BODY=$(cat "$TMPDIR/kanban_test_body.json")

if command -v jq &> /dev/null; then
    COLUMN=$(echo "$BODY" | jq -r ".[] | select(.ticketId==\"$TICKET_ID_1\") | .column")
else
    # シンプルな確認: チケットIDの後に doing があるか
    if echo "$BODY" | grep -A5 "$TICKET_ID_1" | grep -q '"doing"'; then
        COLUMN="doing"
    else
        COLUMN="unknown"
    fi
fi

if [ "$COLUMN" = "doing" ]; then
    pass_test "チケットは doing カラムに移動した"
else
    fail_test "カラム移動確認" "doing" "$COLUMN"
fi

echo ""

########################################
echo "--- [7] PATCH /api/tickets/{id}/progress - 進捗更新 ---"
########################################

STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_1/progress" '{"progress":75}')
assert_status "$STATUS" "204" "PATCH /api/tickets/{id}/progress は 204 を返す"

# 進捗確認
STATUS=$(curl_request GET "$BASE_URL/api/tickets")
BODY=$(cat "$TMPDIR/kanban_test_body.json")

if command -v jq &> /dev/null; then
    PROGRESS=$(echo "$BODY" | jq -r ".[] | select(.ticketId==\"$TICKET_ID_1\") | .progress")
else
    if echo "$BODY" | grep -A20 "$TICKET_ID_1" | grep -o '"progress": *[0-9]*' | head -1 | grep -q '75'; then
        PROGRESS="75"
    else
        PROGRESS="unknown"
    fi
fi

if [ "$PROGRESS" = "75" ]; then
    pass_test "進捗は 75 に更新された"
else
    fail_test "進捗確認" "75" "$PROGRESS"
fi

# 境界値テスト: 100以上は100に制限
STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_1/progress" '{"progress":150}')
assert_status "$STATUS" "204" "PATCH progress (150) は 204 を返す"

if command -v jq &> /dev/null; then
    PROGRESS=$(echo "$BODY" | jq -r ".[] | select(.ticketId==\"$TICKET_ID_1\") | .progress")
else
    STATUS=$(curl_request GET "$BASE_URL/api/tickets")
    BODY=$(cat "$TMPDIR/kanban_test_body.json")
fi

# 負の値テスト
STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_1/progress" '{"progress":-10}')
assert_status "$STATUS" "204" "PATCH progress (-10) は 204 を返す"

echo ""

########################################
echo "--- [8] PATCH /api/tickets/{id}/child-task/{index} - 子タスク切替 ---"
########################################

# まずチケットに子タスクがあることを確認（PUTで更新済み）
STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_1/child-task/0" '{"done":true}')
assert_status "$STATUS" "200" "PATCH /api/tickets/{id}/child-task/0 は 200 を返す"

BODY=$(cat "$TMPDIR/kanban_test_body.json")
if echo "$BODY" | grep -q '"done": *true'; then
    pass_test "子タスクの完了状態が更新された"
else
    fail_test "子タスク完了状態確認" "done: true" "見つからなかった"
fi

# 範囲外インデックスで400エラー
STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_1/child-task/99" '{"done":true}')
assert_status "$STATUS" "400" "PATCH child-task (範囲外) は 400 を返す"

echo ""

########################################
echo "--- [9] DELETE /api/tickets/{id} - チケット削除 ---"
########################################

# チケット3を削除
STATUS=$(curl_request DELETE "$BASE_URL/api/tickets/$TICKET_ID_3")
assert_status "$STATUS" "204" "DELETE /api/tickets/{id} は 204 を返す"

# 再削除でアーカイブから完全削除（204）
STATUS=$(curl_request DELETE "$BASE_URL/api/tickets/$TICKET_ID_3")
assert_status "$STATUS" "204" "DELETE (既に削除済み) は 204 を返す（アーカイブから完全削除）"

# 一覧に存在しないことを確認
STATUS=$(curl_request GET "$BASE_URL/api/tickets")
BODY=$(cat "$TMPDIR/kanban_test_body.json")

if command -v jq &> /dev/null; then
    COUNT=$(echo "$BODY" | jq 'length')
else
    COUNT=$(echo "$BODY" | grep -o '"ticketId"' | wc -l)
fi

# TICKET_ID_3 が含まれていないか確認
if echo "$BODY" | grep -q "$TICKET_ID_3"; then
    fail_test "削除されたチケットは一覧に存在しないこと" "存在しない" "存在している"
else
    pass_test "削除されたチケットは一覧に存在しない"
fi

echo ""

########################################
echo "--- [10] エラーケーステスト ---"
########################################

# 存在しないIDでGET（一覧から確認）
FAKE_ID="nonexistent-id-12345"

STATUS=$(curl_request PUT "$BASE_URL/api/tickets/$FAKE_ID" '{"title":"test"}')
assert_status "$STATUS" "404" "PUT (存在しないID) は 404 を返す"

STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$FAKE_ID/column" '{"column":"todo"}')
assert_status "$STATUS" "404" "PATCH column (存在しないID) は 404 を返す"

STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$FAKE_ID/progress" '{"progress":50}')
assert_status "$STATUS" "404" "PATCH progress (存在しないID) は 404 を返す"

echo ""

########################################
echo "--- [11] カラム移動後のPosition確認 ---"
########################################

# チケット2を done に移動してPositionが設定されるか確認
STATUS=$(curl_request PATCH "$BASE_URL/api/tickets/$TICKET_ID_2/column" '{"column":"done"}')
assert_status "$STATUS" "204" "PATCH column (doneへ移動) は 204 を返す"

STATUS=$(curl_request GET "$BASE_URL/api/tickets")
BODY=$(cat "$TMPDIR/kanban_test_body.json")

if command -v jq &> /dev/null; then
    TICKET_B_COLUMN=$(echo "$BODY" | jq -r ".[] | select(.ticketId==\"$TICKET_ID_2\") | .column")
else
    if echo "$BODY" | grep -A5 "$TICKET_ID_2" | grep -q '"done"'; then
        TICKET_B_COLUMN="done"
    else
        TICKET_B_COLUMN="unknown"
    fi
fi

if [ "$TICKET_B_COLUMN" = "done" ]; then
    pass_test "チケットBは done カラムに移動した"
else
    fail_test "カラム移動確認 (done)" "done" "$TICKET_B_COLUMN"
fi

echo ""

########################################
# クリーンアップ
########################################
echo "--- [クリーンアップ] テストデータ削除 ---"

curl -s -X DELETE "$BASE_URL/api/tickets/$TICKET_ID_1" 2>/dev/null || true
curl -s -X DELETE "$BASE_URL/api/tickets/$TICKET_ID_2" 2>/dev/null || true
echo "テストチケットを削除しました"
echo ""

########################################
# 結果サマリー
########################################
echo "=========================================="
echo " テスト結果サマリー"
echo "=========================================="
echo -e "  総数: $TOTAL"
echo -e "  ${GREEN}成功: $PASSED${NC}"
if [ "$FAILED" -gt 0 ]; then
    echo -e "  ${RED}失敗: $FAILED${NC}"
else
    echo -e "  失敗: 0"
fi
echo "=========================================="

# テンポラリファイル削除
rm -rf "$TMPDIR"

if [ "$FAILED" -gt 0 ]; then
    exit 1
else
    echo -e "${GREEN}すべてのテストが通過しました!${NC}"
    exit 0
fi

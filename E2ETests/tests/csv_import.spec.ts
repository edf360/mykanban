import { test, expect } from '@playwright/test';

/**
 * CSVインポート・エクスポート関連テスト
 * - TC-FUNC-025: マルチラインメモ含むCSVインポート
 * - TC-FUNC-027: 子タスク完了状況含むCSVインポート
 * - TC-FUNC-028: 空のCSVインポート
 * - TC-FUNC-084: Position値重複のCSVデータ
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

// ユニークな名前を生成
function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`;
}

// ブラウザ側で一時CSVファイル(Blob)を作成し、file inputに設定するヘルパー
async function uploadCsvFile(page: any, csvContent: string, filename: string = 'test.csv') {
  await page.evaluate(({ content, fname }) => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
    const encoder = new TextEncoder();
    const fileBytes = encoder.encode(content);
    const merged = new Uint8Array(bom.length + fileBytes.length);
    merged.set(bom, 0);
    merged.set(fileBytes, bom.length);
    const blob = new Blob([merged], { type: 'text/csv;charset=utf-8' });
    const file = new File([blob], fname, { type: 'text/csv;charset=utf-8' });
    
    const input = document.getElementById('importCsvFileInput');
    if (!input) throw new Error('importCsvFileInput not found');
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { content: csvContent, fname: filename });
}

// 空のCSVファイルをアップロード
async function uploadEmptyCsvFile(page: any) {
  await page.evaluate(() => {
    const blob = new Blob([], { type: 'text/csv' });
    const file = new File([blob], 'empty.csv', { type: 'text/csv' });
    
    const input = document.getElementById('importCsvFileInput') as HTMLInputElement;
    if (!input) throw new Error('importCsvFileInput not found');
    
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    input.files = dataTransfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

// ページコンテキスト内でチケット一覧を取得（認証トークンをsessionStorageから取得）
async function getTicketsViaPage(page: any): Promise<any[]> {
  return await page.evaluate(async () => {
    // 認証情報はsessionStorageの'kanban_auth'キーにJSONで保存されている
    const authData = sessionStorage.getItem('kanban_auth');
    const headers: any = {};
    if (authData) {
      try {
        const auth = JSON.parse(authData);
        if (auth && auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
      } catch (e) {
        // JSONパース失敗は無視
      }
    }
    const response = await fetch('/api/tickets', { headers });
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  });
}

test.describe('CSVインポート・エクスポート', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // TC-FUNC-025: マルチラインメモ含むCSVインポート
  test('TC-FUNC-025: マルチラインメモ含むCSVをインポートし、改行が正しく保持される', async ({ page }) => {
    const ticketId = uniqueName('ML');
    // マルチラインメモを含むCSVデータ（RFC 4180準拠のダブルクォート囲み）
    // ヘッダー: タスクID,タスク名,バケット,状態,担当者,開始日,期限,チェックリスト項目,ラベル,メモ
    // データ:   ML-xxx, 名前,     (空),  開始前, 山田,  (空),  (空), (空),          (空), メモ
    const csvContent = `タスクID,タスク名,バケット,状態,担当者,開始日,期限,チェックリスト項目,ラベル,メモ
${ticketId},マルチラインメモテスト,,開始前,山田,,,,,"テストメモ1行
これは2行目です
さらに3行目も存在します"`;

    // dialogイベントを事前に設定（確認ダイアログと完了アラートをaccept）
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);

    // CSVインポートボタンをクリック
    await page.click('#importCsvBtn');

    // ファイルアップロード（ブラウザ側のBlob使用）
    await uploadCsvFile(page, csvContent, 'multiline_memo.csv');

    // インポート完了後、ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // チケットが存在することを確認（data-id属性を使用）
    const ticketCard = page.locator(`[data-id="${ticketId}"]`);
    await expect(ticketCard).toBeVisible({ timeout: 10000 });

    // ページコンテキスト経由でチケットを取得し、メモに改行が含まれていることを確認
    const tickets = await getTicketsViaPage(page);
    const importedTicket = tickets.find((t: any) => t.ticketId === ticketId);

    expect(importedTicket).toBeDefined();
    expect(importedTicket.memo).toContain('テストメモ1行');
    expect(importedTicket.memo).toContain('2行目');
    expect(importedTicket.memo).toContain('3行目');
    // 改行が保持されていることを確認
    expect(importedTicket.memo).toContain('\n');
  });

  // TC-FUNC-027: 子タスク完了状況含むCSVインポート
  test('TC-FUNC-027: 子タスク完了状況含むCSVをインポートし、Doneはすべてfalseに初期化される', async ({ page }) => {
    const ticketId = uniqueName('CT');
    // 【100%】以外の進捗率を持つチェックリスト項目（Done=falseになるべき）
    // 【0%】,【30%】,【50%】,【80%】などは Done=false になる
    // ヘッダー: タスクID,タスク名,バケット,状態,担当者,開始日,期限,チェックリスト項目,ラベル,メモ
    // データ:   CT-xxx, 名前,     (空),  開始前, 山田,  (空),  (空), チェックリスト,   (空), メモ
    const csvContent = `タスクID,タスク名,バケット,状態,担当者,開始日,期限,チェックリスト項目,ラベル,メモ
${ticketId},子タスクテスト,,開始前,山田,,,【0%】サブタスクA;【30%】サブタスクB;【50%】サブタスクC;【80%】サブタスクD,,進捗率テスト`;

    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);

    // CSVインポートボタンをクリック
    await page.click('#importCsvBtn');

    // ファイルアップロード
    await uploadCsvFile(page, csvContent, `childtasks_${ticketId}.csv`);

    // インポート完了後、ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // チケットが存在することを確認（data-id属性を使用）
    const ticketCard = page.locator(`[data-id="${ticketId}"]`);
    await expect(ticketCard).toBeVisible({ timeout: 10000 });

    // ページコンテキスト経由で子タスクのDone状態を確認
    const tickets = await getTicketsViaPage(page);
    console.log('TC-FUNC-027: All tickets count:', tickets.length);
    console.log('TC-FUNC-027: Looking for ticketId:', ticketId);
    const importedTicket = tickets.find((t: any) => t.ticketId === ticketId);
    console.log('TC-FUNC-027: Imported ticket:', JSON.stringify(importedTicket, null, 2));

    expect(importedTicket).toBeDefined();
    expect(importedTicket.childTasks).toBeDefined();
    expect(importedTicket.childTasks.length).toBe(4);

    // すべての子タスクのDoneがfalseであることを確認
    for (const ct of importedTicket.childTasks) {
      expect(ct.done).toBe(false);
    }
  });

  // TC-FUNC-028: 空のCSVインポート
  test('TC-FUNC-028: 空のCSVファイルをインポートするとエラーメッセージが表示される', async ({ page }) => {
    // dialogイベントをキャプチャ
    // 1つ目は確認ダイアログ（accept）、2つ目がエラーアラート
    const dialogMessages: string[] = [];
    page.on('dialog', async dialog => {
      dialogMessages.push(dialog.message());
      // 確認ダイアログはaccept、エラーはdismiss
      if (dialog.message().includes('インポートしますか')) {
        await dialog.accept();
      } else {
        await dialog.dismiss();
      }
    });

    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);

    // CSVインポートボタンをクリック
    await page.click('#importCsvBtn');

    // 空のCSVファイルをアップロード
    await uploadEmptyCsvFile(page);

    // エラーダイアログが表示されることを確認
    await page.waitForTimeout(3000);

    // エラーメッセージが含まれていることを確認
    const errorMessages = dialogMessages.filter(m => !m.includes('インポートしますか'));
    expect(errorMessages.length).toBeGreaterThanOrEqual(1);
    const errorMessage = errorMessages[0];
    expect(errorMessage).toMatch(/エラー|失敗|見つかり/i);
  });

  // TC-FUNC-084: Position値重複のCSVデータ
  test('TC-FUNC-084: Position値重複のCSVデータをインポートし、サーバー側でPosition重複が解消される', async ({ page }) => {
    // 同じ状態(カラム)に複数のチケットをインポート
    // サーバー側でRepositionAllColumns()が呼ばれ、Positionが再計算される
    const ticketId1 = uniqueName('POS');
    const ticketId2 = `${ticketId1}-2`;
    const ticketId3 = `${ticketId1}-3`;

    // ヘッダーはサンプルCSVに合わせて「バケット」列を含む
    const csvContent = `タスクID,タスク名,バケット,状態,担当者,開始日,期限,チェックリスト項目,ラベル,メモ
${ticketId1},ポジション重複テスト1,,開始前,山田,,,,,基本機能,ポジションテスト1
${ticketId2},ポジション重複テスト2,,開始前,山田,,,,,基本機能,ポジションテスト2
${ticketId3},ポジション重複テスト3,,開始前,山田,,,,,基本機能,ポジションテスト3`;

    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);

    // CSVインポートボタンをクリック
    await page.click('#importCsvBtn');

    // ファイルアップロード
    await uploadCsvFile(page, csvContent, 'position_dup.csv');

    // インポート完了後、ページがリロードされるのを待つ
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    // ページコンテキスト経由でチケットを取得し、Position値が重複しないことを確認
    const tickets = await getTicketsViaPage(page);

    // インポートしたチケットをフィルタリング
    const importedTickets = tickets.filter(
      (t: any) => t.ticketId?.startsWith(ticketId1)
    );

    // 3つのチケットがインポートされていることを確認
    expect(importedTickets.length).toBeGreaterThanOrEqual(3);

    // 同じカラム(todo)にあるチケットのPosition値を取得
    const todoTickets = importedTickets.filter((t: any) => t.column === 'todo');
    const positions = todoTickets.map((t: any) => t.position);

    // Position値に重複がないことを確認
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(positions.length);

    // 各Position値が異なることを確認
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(positions[i]).not.toBe(positions[j]);
      }
    }
  });
});

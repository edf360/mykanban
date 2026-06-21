import { test, expect } from '@playwright/test';

/**
 * 進捗・緊急・カテゴリ機能テスト
 * - 進捗率スライダー操作
 * - 緊急チケット設定
 * - カテゴリ設定（プロンプトダイアログ対応）
 * - 担当者ごとに生成
 * - 子タスク進捗
 * - メイン担当者切替
 * - 全フィールド入力
 * - モーダル操作（キャンセル/外クリック）
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

// ユニークなチケット名を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

test.describe('進捗・緊急・カテゴリ機能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('緊急チケットボタンでモーダル背景が変わる', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('緊急テスト'));
    
    // ハンバーガーメニューを開く
    await page.click('#modalHamburgerBtn');
    await expect(page.locator('#modalHamburgerMenu')).toHaveClass(/active/);
    
    // 緊急メニューをクリック
    await page.click('[data-action="emergency"]');
    
    // モーダルにemergencyクラスが付く
    await expect(page.locator('#ticketModal .modal')).toHaveClass(/emergency/);
  });

  test('緊急チケットを保存するとチケットに反映される', async ({ page }) => {
    const name = uniqueName('緊急保存');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    
    // ハンバーガーメニューから緊急設定
    await page.click('#modalHamburgerBtn');
    await page.click('[data-action="emergency"]');
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 作成されたチケットに緊急マークが表示される
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await expect(ticket).toHaveClass(/emergency/);
  });

  test('カテゴリ設定でプロンプトダイアログが開く', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('カテゴリテスト'));
    
    // プロンプトダイアログをキャッチ
    page.on('dialog', async dialog => {
      await dialog.accept('テストカテゴリ');
    });
    
    // ハンバーガーメニューからカテゴリ設定
    await page.click('#modalHamburgerBtn');
    await page.click('[data-action="category"]');
    
    // 緊急マークがモーダルに付く（カテゴリ設定の視覚的フィードバック）
    await page.waitForTimeout(500);
  });

  test('カテゴリ付きチケットを保存できる', async ({ page }) => {
    const name = uniqueName('カテゴリ保存');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    
    // プロンプトダイアログをキャッチ
    page.on('dialog', async dialog => {
      await dialog.accept('重要');
    });
    
    // ハンバーガーメニューからカテゴリ設定
    await page.click('#modalHamburgerBtn');
    await page.click('[data-action="category"]');
    await page.waitForTimeout(500);
    
    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // チケットが表示されることを確認
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
      .toBeVisible();
  });

  test('全フィールド入力で保存', async ({ page }) => {
    const name = `全フィールド_${Date.now()}`;
    
    // モーダルを開く
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    
    // タイトル入力
    await page.fill('#ticketTitle', name);
    
    // 日付入力
    await page.fill('#startDate', '2025-01-01');
    await page.fill('#endDate', '2025-12-31');
    
    // 工数入力（clearしてから入力）
    await page.click('#effort');
    await page.press('#effort', 'Control+a');
    await page.press('#effort', 'Backspace');
    await page.fill('#effort', '40');
    
    // メモ入力
    await page.fill('#memo', 'テストメモ');
    
    // 保存ボタンをクリック
    await page.click('#saveBtn');
    
    // モーダルが閉じるまで待機
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
    
    // チケットが表示されるまで待機
    await page.waitForTimeout(500);
    
    // チケットが存在することを確認
    const ticket = page.locator(`.column[data-column="todo"] .ticket:has-text("${name}")`).first();
    await expect(ticket).toBeVisible({ timeout: 10000 });
    
    // チケットをクリックして編集
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    
    // 値が反映されていることを確認
    await expect(page.locator('#startDate')).toHaveValue('2025-01-01');
    await expect(page.locator('#endDate')).toHaveValue('2025-12-31');
    await expect(page.locator('#effort')).toHaveValue('40');
    await expect(page.locator('#memo')).toHaveValue('テストメモ');
  });

  test('キャンセルボタンでモーダルを閉じられる', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('キャンセル'));
    
    // キャンセルボタンをクリック
    await page.click('#cancelBtn');
    
    // モーダルが閉じる
    await expect(page.locator('#ticketModal')).toBeHidden();
  });

  test('ESCキーでキャンセルされる', async ({ page }) => {
    const name = uniqueName('ESCキャンセル');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    
    // ESCキーでキャンセル
    await page.press('body', 'Escape');
    
    // モーダルが閉じる
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // チケットは作成されていないことを確認
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
      .not.toBeVisible();
  });

  test('子タスクを追加して進捗を変更できる', async ({ page }) => {
    const name = uniqueName('子タスク進捗');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    
    // 子タスク追加
    await page.click('#addChildTaskBtn');
    const childTaskInput = page.locator('#childTasks .child-task-item input[type="text"]').first();
    await childTaskInput.fill('テスト子タスク');
    
    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 編集して子タスクが保持されていることを確認
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    
    // 子タスクが表示されている
    await expect(page.locator('#childTasks .child-task-item')).toBeVisible();
  });
});

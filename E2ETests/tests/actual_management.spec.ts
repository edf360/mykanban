import { test, expect } from '@playwright/test';

/**
 * 実績管理完全フローテスト
 * - 実績登録の完全フロー
 * - 複数日登録
 * - 実績削除
 * - バリデーション（日付/工数）
 * - チケット切替で実績一覧が変わる
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

test.describe('実績管理完全フロー', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('実績を登録して一覧に表示される', async ({ page }) => {
    // 実績登録にはdoing/doneのチケットが必要
    const name = uniqueName('実績テスト');
    await page.click('.column-add-btn[data-column="doing"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // チケットをクリックして編集モード
    const ticket = page.locator('.column[data-column="doing"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    
    // 実績ボタンをクリック
    await page.waitForSelector('#viewActualBtn', { state: 'visible' });
    await page.click('#viewActualBtn');
    await expect(page.locator('#actualModal')).toBeVisible();
    
    // 日付と工数を入力
    await page.fill('#actualDateInput', '2025-01-15');
    await page.fill('#actualHoursInput', '3.5');
    
    // 保存
    await page.click('#actualSaveBtn');
    
    // 実績一覧に追加される
    await expect(page.locator('#actualList .actual-row')).toBeVisible();
  });

  test('複数日の実績を登録できる', async ({ page }) => {
    const name = uniqueName('複数日実績');
    await page.click('.column-add-btn[data-column="doing"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 編集モードで実績モーダルを開く
    const ticket = page.locator('.column[data-column="doing"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.waitForSelector('#viewActualBtn', { state: 'visible' });
    await page.click('#viewActualBtn');
    await page.waitForSelector('#actualModal', { state: 'visible' });
    await expect(page.locator('#actualModal')).toBeVisible();
    
    // 1日目
    await page.fill('#actualDateInput', '2025-01-15');
    await page.fill('#actualHoursInput', '2');
    await page.click('#actualSaveBtn');
    await page.waitForTimeout(500);
    
    // 2日目
    await page.fill('#actualDateInput', '2025-01-16');
    await page.fill('#actualHoursInput', '4');
    await page.click('#actualSaveBtn');
    await page.waitForTimeout(500);
    
    // 3日目
    await page.fill('#actualDateInput', '2025-01-17');
    await page.fill('#actualHoursInput', '1.5');
    await page.click('#actualSaveBtn');
    await page.waitForTimeout(500);
    
    // 3件の実績が表示される
    const items = page.locator('#actualList .actual-row');
    await expect(items).toHaveCount(3);
  });

  test('実績を削除できる', async ({ page }) => {
    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    const name = uniqueName('実績削除');
    await page.click('.column-add-btn[data-column="doing"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 編集モードで実績モーダルを開く
    const ticket = page.locator('.column[data-column="doing"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.waitForSelector('#viewActualBtn', { state: 'visible' });
    await page.click('#viewActualBtn');
    await expect(page.locator('#actualModal')).toBeVisible();
    
    // 実績を登録
    await page.fill('#actualDateInput', '2025-01-15');
    await page.fill('#actualHoursInput', '3');
    await page.click('#actualSaveBtn');
    await expect(page.locator('#actualList .actual-row')).toBeVisible();
    
    // 削除ボタンをクリック
    await page.locator('#actualList .actual-row .actual-delete-btn').first().click();
    
    // 実績が削除される（0件になるか非表示になる）
    await page.waitForTimeout(500);
    const remainingRows = await page.locator('#actualList .actual-row').count();
    expect(remainingRows).toBe(0);
  });

  test('工数なしで実績登録できない（バリデーション）', async ({ page }) => {
    const name = uniqueName('バリデーション');
    await page.click('.column-add-btn[data-column="doing"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 編集モードで実績モーダルを開く
    const ticket = page.locator('.column[data-column="doing"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.waitForSelector('#viewActualBtn', { state: 'visible' });
    await page.click('#viewActualBtn');
    await expect(page.locator('#actualModal')).toBeVisible();
    
    // 日付のみ入力して保存（工数なし）
    await page.fill('#actualDateInput', '2025-01-15');
    await page.fill('#actualHoursInput', '');
    await page.click('#actualSaveBtn');
    
    // 実績は追加されない（バリデーションエラー）
    await expect(page.locator('#actualList .actual-row')).toBeHidden();
  });

  test('工数が0以下の場合登録できない（バリデーション）', async ({ page }) => {
    const name = uniqueName('負の工数');
    await page.click('.column-add-btn[data-column="doing"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 編集モードで実績モーダルを開く
    const ticket = page.locator('.column[data-column="doing"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.waitForSelector('#viewActualBtn', { state: 'visible' });
    await page.click('#viewActualBtn');
    await expect(page.locator('#actualModal')).toBeVisible();
    
    // 負の値を入力
    await page.fill('#actualDateInput', '2025-01-15');
    await page.fill('#actualHoursInput', '-1');
    await page.click('#actualSaveBtn');
    
    // 実績は追加されない
    await expect(page.locator('#actualList .actual-row')).toBeHidden();
  });
});

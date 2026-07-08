import { test, expect } from '@playwright/test';

test.describe('折りたたみ状態のユーザー別保存 (B01)', () => {
  test('折りたたみ状態がlocalStorageに保存・復元される', async ({ page }) => {
    // ログイン
    await page.goto('http://localhost:5000');
    await page.fill('#loginUsername', 'admin');
    await page.fill('#loginPassword', 'clsw');
    await page.click('#loginBtn');
    await page.waitForTimeout(1000);

    // 折りたたみ可能なチケットがあるか確認（子タスクがあるチケット、または期限があるチケット）
    // まずチケットを作成してテスト
    const todoColumn = page.locator('.column[data-column="todo"]');
    
    // 新規チケットボタンをクリック（todoカラムの＋ボタン）
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', '折りたたみテストチケット');
    
    // 子タスクを追加（折りたたみボタンを表示するため）
    const addChildBtn = page.locator('#addChildTaskBtn');
    await addChildBtn.click();
    await page.waitForTimeout(500);
    
    // 保存
    await page.click('#saveBtn');
    await page.waitForTimeout(2000);

    // チケットが作成されたことを確認（最初に作成されるので最初を取得）
    const tickets = page.locator('.ticket:has-text("折りたたみテストチケット")');
    const ticket = tickets.first();
    await expect(ticket).toBeVisible();
    
    // チケットのレンダリングが完了するまで待つ
    await page.waitForTimeout(1000);

    // チケットIDを取得（後でリロード後に使用）
    const ticketId = await ticket.getAttribute('data-id');

    // 折りたたみボタンがあることを確認
    const collapseBtn = ticket.locator('.ticket-collapse-btn');
    await expect(collapseBtn).toBeVisible();

    // 折りたたみボタンをクリック
    await collapseBtn.click();
    await page.waitForTimeout(1000);

    // 折りたたみ状態になっていることを確認
    await expect(ticket).toHaveClass(/collapsed/);

    // localStorageに保存されていることを確認
    const localStorageData = await page.evaluate(() => {
      const key = Object.keys(localStorage).find(k => k.startsWith('kanban_user_settings_'));
      if (key) {
        return JSON.parse(localStorage[key]);
      }
      return null;
    });

    expect(localStorageData).not.toBeNull();
    expect(localStorageData.collapsedTickets).toBeDefined();
    expect(Array.isArray(localStorageData.collapsedTickets)).toBe(true);

    // 折りたたみ状態の配列にチケットIdが含まれていることを確認
    const isCollapsed = await page.evaluate(({ id }) => {
      const key = Object.keys(localStorage).find(k => k.startsWith('kanban_user_settings_'));
      if (key) {
        const data = JSON.parse(localStorage[key]);
        return data.collapsedTickets && data.collapsedTickets.includes(id);
      }
      return false;
    }, { id: ticketId });
    
    expect(isCollapsed).toBe(true);
    
    // ページをリロード
    await page.reload();
    await page.waitForTimeout(2000);
    
    // ログインし直す（セッションが切れている場合）
    if (await page.locator('#loginScreen').isVisible()) {
      await page.fill('#loginUsername', 'admin');
      await page.fill('#loginPassword', 'clsw');
      await page.click('#loginBtn');
      await page.waitForTimeout(1000);
    }
    
    // 折りたたみ状態が復元されていることを確認
    const ticketAfterReload = page.locator('.ticket[data-id="' + ticketId + '"]');
    await expect(ticketAfterReload).toHaveClass(/collapsed/);
  });
});

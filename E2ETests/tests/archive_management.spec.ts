import { test, expect } from '@playwright/test';

/**
 * アーカイブ管理テスト (TC-FUNC-075~077)
 * - archiveチケットがF5後もarchiveカラムに表示
 * - done/archiveチケットは打消し線表示、逾期色分け非表示
 * - archiveチケット削除後F5で復活しない
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  // 既にログイン済みの場合はログアウトする
  const isLoggedIn = await page.locator('#appContent').isVisible();
  if (isLoggedIn) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
  }
  // ログイン画面が表示されるまで待つ
  await expect(page.locator('#loginScreen')).toBeVisible({ timeout: 10000 });
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.press('#loginPassword', 'Enter');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
  await page.waitForTimeout(1000);
}

// ユニークな名前を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

test.describe('アーカイブ管理（TC-FUNC-075~077）', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('TC-FUNC-075: archiveチケットがF5後もarchiveカラムに表示', async ({ page }) => {
    // 日付付きチケットを作成（アーカイブするにはendDateが必要）
    const title = uniqueName('アーカイブテスト');
    
    // TODOカラムにチケットを作成
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.fill('#ticketTitle', title);
    await page.fill('#startDate', '2025-01-01');
    await page.fill('#endDate', '2025-01-10');
    await page.click('#saveBtn');
    await page.waitForTimeout(1000);

    // チケットがTODOカラムに表示されることを確認
    const todoTicket = page.locator('.column[data-column="todo"] .ticket:has-text("' + title + '")').first();
    await expect(todoTicket).toBeVisible();

    // チケットをDONEカラムにドラッグ＆ドロップ
    const doingColumn = page.locator('.column[data-column="doing"] .ticket-list');
    const doneColumn = page.locator('.column[data-column="done"] .ticket-list');
    
    // ドラッグ＆ドロップでTODO→DOING→DONEへ移動
    await todoTicket.dragTo(doingColumn);
    await page.waitForTimeout(1000);
    
    const doneTicket = page.locator('.column[data-column="doing"] .ticket:has-text("' + title + '")').first();
    await doneTicket.dragTo(doneColumn);
    await page.waitForTimeout(1000);

    // DONEカラムに移動したことを確認
    await expect(page.locator('.column[data-column="done"] .ticket:has-text("' + title + '")').first()).toBeVisible();

    // archiveカラムを表示
    const archiveToggleBtn = page.locator('#archiveToggleBtn');
    if (await archiveToggleBtn.isVisible().catch(() => false)) {
      await archiveToggleBtn.click();
      await page.waitForTimeout(500);
    }

    // archiveカラムが存在することを確認
    const archiveColumn = page.locator('#archiveColumn');
    await expect(archiveColumn).toBeVisible();

    // DONEカラムからarchiveカラムにドラッグ＆ドロップ
    const doneTicketForArchive = page.locator('.column[data-column="done"] .ticket:has-text("' + title + '")').first();
    const archiveList = archiveColumn.locator('.ticket-list');
    await doneTicketForArchive.dragTo(archiveList);
    await page.waitForTimeout(2000);

    // archiveカラムにチケットが表示されることを確認
    const archiveTicket = archiveColumn.locator('.ticket:has-text("' + title + '")').first();
    await expect(archiveTicket).toBeVisible();

    // ページをリロード（F5）
    await page.reload();
    await page.waitForTimeout(3000);

    // ログインし直す（セッションが切れている場合）
    if (await page.locator('#loginScreen').isVisible().catch(() => false)) {
      await page.fill('#loginUsername', 'admin');
      await page.fill('#loginPassword', 'clsw');
      await page.press('#loginPassword', 'Enter');
      await page.waitForTimeout(2000);
    }

    // archiveカラムが引き続き表示されていることを確認（状態復元）
    // archiveカラムの表示状態はlocalStorageに保存される
    const archiveColumnAfterReload = page.locator('#archiveColumn');
    const isVisible = await archiveColumnAfterReload.evaluate(el => !el.classList.contains('hidden'));
    expect(isVisible).toBe(true);

    // archiveカラムにチケットが引き続き表示されることを確認
    const archiveTicketAfterReload = archiveColumnAfterReload.locator('.ticket:has-text("' + title + '")').first();
    await expect(archiveTicketAfterReload).toBeVisible();
  });

  test('TC-FUNC-076: done/archiveチケットは打消し線表示、逾期色分け非表示', async ({ page }) => {
    // 過去の終了日を持つチケットを作成
    const title = uniqueName('打消し線テスト');
    
    await page.click('.column-add-btn[data-column="done"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.fill('#ticketTitle', title);
    await page.fill('#startDate', '2024-01-01');
    await page.fill('#endDate', '2024-01-10');
    await page.click('#saveBtn');
    await page.waitForTimeout(1000);

    // DONEカラムにチケットが表示されることを確認
    const doneTicket = page.locator('.column[data-column="done"] .ticket:has-text("' + title + '")').first();
    await expect(doneTicket).toBeVisible();

    // done-or-archivedクラスが付いていることを確認
    const hasDoneOrArchivedClass = await doneTicket.evaluate(el => el.classList.contains('done-or-archived'));
    expect(hasDoneOrArchivedClass).toBe(true);

    // ticket-completedクラスが付いていることを確認（打消し線）
    const hasCompletedClass = await doneTicket.evaluate(el => el.classList.contains('ticket-completed'));
    expect(hasCompletedClass).toBe(true);

    // 逾期色分けクラス（overdueやdue-todayなど）が付いていないことを確認
    const hasOverdueClass = await doneTicket.evaluate(el => 
      el.classList.contains('overdue') || el.classList.contains('due-today')
    );
    expect(hasOverdueClass).toBe(false);
  });

  test('TC-FUNC-077: archiveチケット削除後F5で復活しない', async ({ page }) => {
    // dialogイベントを事前に設定（confirmダイアログ対応）
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // 日付付きチケットを作成
    const title = uniqueName('削除テスト');
    
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.fill('#ticketTitle', title);
    await page.fill('#startDate', '2025-01-01');
    await page.fill('#endDate', '2025-01-10');
    await page.click('#saveBtn');
    await page.waitForTimeout(1000);

    // TODO→DOING→DONE→Archiveへ移動
    const todoTicket = page.locator('.column[data-column="todo"] .ticket:has-text("' + title + '")').first();
    await todoTicket.dragTo(page.locator('.column[data-column="doing"] .ticket-list'));
    await page.waitForTimeout(500);
    
    await page.locator('.column[data-column="doing"] .ticket:has-text("' + title + '")').first()
      .dragTo(page.locator('.column[data-column="done"] .ticket-list'));
    await page.waitForTimeout(500);

    // archiveカラムを表示
    const archiveToggleBtn = page.locator('#archiveToggleBtn');
    if (await archiveToggleBtn.isVisible().catch(() => false)) {
      await archiveToggleBtn.click();
      await page.waitForTimeout(500);
    }

    // DONE→Archiveへ移動
    await page.locator('.column[data-column="done"] .ticket:has-text("' + title + '")').first()
      .dragTo(page.locator('#archiveColumn .ticket-list'));
    await page.waitForTimeout(2000);

    // archiveカラムにチケットが存在することを確認
    const archiveTicket = page.locator('#archiveColumn .ticket:has-text("' + title + '")').first();
    await expect(archiveTicket).toBeVisible();

    // archiveチケットを完全に削除（deleteボタンクリック）
    await archiveTicket.hover();
    await archiveTicket.locator('.delete-btn').click();
    await page.waitForTimeout(2000);

    // 削除されたことを確認
    const deletedTicket = page.locator('#archiveColumn .ticket:has-text("' + title + '")').first();
    const countAfterDelete = await deletedTicket.count();
    expect(countAfterDelete).toBe(0);

    // ページをリロード（F5）
    await page.reload();
    await page.waitForTimeout(3000);

    // ログインし直す（セッションが切れている場合）
    if (await page.locator('#loginScreen').isVisible().catch(() => false)) {
      await page.fill('#loginUsername', 'admin');
      await page.fill('#loginPassword', 'clsw');
      await page.press('#loginPassword', 'Enter');
      await page.waitForTimeout(2000);
    }

    // archiveカラムを表示（必要に応じて）
    const archiveColumn = page.locator('#archiveColumn');
    const isVisible = await archiveColumn.evaluate(el => !el.classList.contains('hidden'));
    if (!isVisible) {
      await archiveToggleBtn.click();
      await page.waitForTimeout(500);
    }

    // 削除されたチケットが復活していないことを確認
    const restoredTicket = archiveColumn.locator('.ticket:has-text("' + title + '")');
    expect(await restoredTicket.count()).toBe(0);
  });
});

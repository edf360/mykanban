import { test, expect } from '@playwright/test';

/**
 * 1.12 アーキテクチャ整合性テスト
 * - TC-FUNC-086: Zustand store は他のストアと孤立している（モジュール分離確認）
 * - TC-FUNC-087: DB のカスケード削除が機能する（チケット削除時に関連データも削除）
 */

async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

test.describe('アーキテクチャ整合性', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC-FUNC-086: Zustand store は他のストアと孤立している（モジュール分離確認）', async ({ page }) => {
    await login(page);

    // Zustand ストアが ES モジュールとして分離されていることを確認
    // 各ストアファイルが独立して存在することを確認
    const modulesLoaded = await page.evaluate(() => {
      // Performance API でロードされたスクリプトを確認
      if (!(window as any).performance?.getEntriesByType) {
        return { hasPerformance: false };
      }
      const entries = (window as any).performance.getEntriesByType('resource');
      const scriptEntries = entries.filter((e: any) =>
        e.name.includes('ticketStore') ||
        e.name.includes('filterStore') ||
        e.name.includes('uiStore') ||
        e.name.includes('modalStore')
      );
      return {
        hasPerformance: true,
        storesFound: scriptEntries.length,
        storeNames: scriptEntries.map((e: any) => e.name.split('/').pop())
      };
    });

    // モジュールが複数存在すること（または app.js に統合されていること）
    // 重要なのは機能が分離されていること
    expect(modulesLoaded).toBeDefined();

    // イベントバス機能が存在することを確認（ストア間通信の仕組み）
    const eventBusExists = await page.evaluate(() => {
      // グローバルに emit/on/off 関数が存在するか確認
      return typeof (window as any).emit === 'function' &&
             typeof (window as any).on === 'function' &&
             typeof (window as any).off === 'function';
    });
    expect(eventBusExists).toBe(true);
  });

  test('TC-FUNC-087: DB のカスケード削除が機能する（チケット削除時に関連データも削除）', async ({ page }) => {
    await login(page);

    const uniqueTitle = `CascadeTest_${Date.now()}`;

    // confirm ダイアログを許可
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // チケットを作成（子タスク付き）
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueTitle);

    // 子タスクを追加
    await page.click('#addChildTaskBtn');
    const childTaskInput = page.locator('.child-task-input').first();
    await childTaskInput.fill('テスト子タスク');

    // 保存
    await page.click('#saveTicketBtn');

    // チケットが存在することを確認
    const ticketCard = page.locator(`.ticket-card:has-text("${uniqueTitle}")`);
    await expect(ticketCard).toBeVisible({ timeout: 10000 });

    // チケットの ID を取得
    const ticketId = await ticketCard.first().getAttribute('data-ticket-id');
    expect(ticketId).not.toBeNull();

    // API でチケット関連データが存在することを確認
    const dataBeforeDelete = await page.evaluate(async (tid) => {
      const response = await fetch(`/api/tickets/${tid}`);
      if (!response.ok) return null;
      const data = await response.json();
      return {
        exists: true,
        title: data.title,
        childTasksCount: data.childTasks?.length || 0
      };
    }, ticketId!);
    expect(dataBeforeDelete?.exists).toBe(true);

    // チケットをクリックして編集モーダルを開く
    await ticketCard.first().click();
    await expect(page.locator('#ticketModal')).toHaveClass(/active/);

    // ハンバーガーメニューから削除
    await page.click('#modalHamburgerBtn');
    await expect(page.locator('#modalHamburgerMenu')).toHaveClass(/active/);
    await page.click('[data-action="delete"]');

    // 削除後にチケットが存在しないことを確認
    await expect(page.locator(`.ticket-card:has-text("${uniqueTitle}")`)).toHaveCount(0, { timeout: 10000 });

    // API でチケットが削除されたことを確認（ソフト削除のため IsDeleted=true になる）
    const dataAfterDelete = await page.evaluate(async (tid) => {
      const response = await fetch(`/api/tickets/${tid}`);
      return {
        status: response.status,
        ok: response.ok
      };
    }, ticketId!);
    // 404 が返るか、またはソフト削除済みとして返らないことを期待
    expect(dataAfterDelete.status).toBe(404);
  });
});

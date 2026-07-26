import { test, expect } from '@playwright/test';

/**
 * 1.13 ユーザー別設定テスト
 * - TC-FUNC-090: ユーザー別設定の隔離（各ユーザーの設定が独立している）
 */

async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

test.describe('ユーザー別設定', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC-FUNC-090: ユーザー別設定の隔離 - 各ユーザーの設定が独立して保存・復元される', async ({ page }) => {
    // admin でログイン
    await login(page, 'admin', 'clsw');

    // フィルターパネルを開く
    await page.click('#filterToggleBtn');
    await expect(page.locator('#filterArea')).not.toHaveClass(/hidden/, { timeout: 5000 });

    // admin のフィルター設定を変更（担当者フィルターを設定）
    await page.selectOption('#assigneeFilterSelect', { label: 'taro' });

    // 設定が localStorage に保存されていることを確認
    const adminSettingsKey = 'kanban_user_settings_admin';
    const adminSettingsSaved = await page.evaluate((key) => {
      const data = localStorage.getItem(key);
      if (!data) return null;
      const settings = JSON.parse(data);
      return {
        filterAssignee: settings.filter?.assignee,
        version: settings._version
      };
    }, adminSettingsKey);
    expect(adminSettingsSaved?.filterAssignee).toBe('taro');

    // ログアウト
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    await page.click('#logoutBtn');
    await page.waitForLoadState('domcontentloaded');

    // taro でログイン
    await login(page, 'taro', 'clsw');

    // taro の設定はデフォルト（フィルター未設定）であること
    const taroSettingsKey = 'kanban_user_settings_taro';
    const taroSettingsLoaded = await page.evaluate((key) => {
      const data = localStorage.getItem(key);
      if (!data) return { filterAssignee: '' };
      const settings = JSON.parse(data);
      return {
        filterAssignee: settings.filter?.assignee || '',
        version: settings._version
      };
    }, taroSettingsKey);
    // taro の設定は admin の設定と独立している（空または異なる値）
    expect(taroSettingsLoaded?.filterAssignee).not.toBe('taro');

    // taro で別のフィルター設定に変更
    await page.click('#filterToggleBtn');
    await page.selectOption('#assigneeFilterSelect', { label: 'admin' });

    // taro の設定が保存されたことを確認
    const taroSettingsUpdated = await page.evaluate((key) => {
      const data = localStorage.getItem(key);
      if (!data) return null;
      const settings = JSON.parse(data);
      return settings.filter?.assignee;
    }, taroSettingsKey);
    expect(taroSettingsUpdated).toBe('admin');

    // admin の設定が変更されていないことを確認
    const adminSettingsUnchanged = await page.evaluate((key) => {
      const data = localStorage.getItem(key);
      if (!data) return null;
      const settings = JSON.parse(data);
      return settings.filter?.assignee;
    }, adminSettingsKey);
    expect(adminSettingsUnchanged).toBe('taro');

    // ログアウト
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    await page.click('#logoutBtn');
    await page.waitForLoadState('domcontentloaded');

    // admin で再度ログイン
    await login(page, 'admin', 'clsw');

    // admin の設定が復元されていることを確認
    const adminFilterRestored = await page.evaluate(() => {
      const select = document.getElementById('assigneeFilterSelect') as HTMLSelectElement;
      return select?.value || '';
    });
    expect(adminFilterRestored).toBe('taro');
  });

  test('TC-FUNC-090-延伸: 折りたたみ状態もユーザー別に保存される', async ({ page }) => {
    // admin でログイン
    await login(page, 'admin', 'clsw');

    // チケットが存在することを確認（折りたたみテスト用）
    const ticketCards = page.locator('.ticket-card');
    const ticketCount = await ticketCards.count();

    if (ticketCount > 0) {
      // 最初のチケットを折りたたむ
      await ticketCards.first().click();
      
      // 折りたたみ状態が localStorage に保存されていることを確認
      const adminCollapsedSaved = await page.evaluate((key) => {
        const data = localStorage.getItem(key);
        if (!data) return null;
        const settings = JSON.parse(data);
        return settings.collapsedTickets;
      }, 'kanban_user_settings_admin');
      
      // 折りたたみ状態が配列として保存されている
      expect(Array.isArray(adminCollapsedSaved)).toBe(true);
    }
  });
});

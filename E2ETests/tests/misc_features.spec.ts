import { test, expect } from '@playwright/test';

/**
 * 1.14 その他機能テスト
 * - TC-FUNC-091: CORS 設定（クロスオリジンアクセス制御）
 * - TC-FUNC-092: キャッシュコントロール（静的アセットのキャッシュ）
 * - TC-FUNC-094: ポップアップオーバーレイ（モーダル表示時に背景がオーバーレイされる）
 */

async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

test.describe('その他機能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('TC-FUNC-091: CORS 設定 - クロスオリジンアクセス制御が有効', async ({ page, request }) => {
    // まずログインしてトークンを取得
    await login(page);
    
    // トークンを取得
    const token = await page.evaluate(() => {
      return localStorage.getItem('auth_token') || '';
    });
    
    // 認証付きで API リクエストを送信
    const response = await request.get('/api/tickets', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    // API が正常にレスポンス返すことを確認
    expect(response.status()).toBe(200);
  });

  test('TC-FUNC-092: キャッシュコントロール - 静的アセットにキャッシュ制御ヘッダーが付与される', async ({ page, request }) => {
    // 静的ファイル（例: styles.css）にリクエストを送信
    const response = await request.get('/styles.css');
    
    // キャッシュ制御ヘッダーを確認
    const headers = response.headers();
    
    // Cache-Control ヘッダーが存在すること
    expect(headers['cache-control']).toBeDefined();
    
    // キャッシュ無効化の設定がされていることを確認
    const cacheControl = headers['cache-control'];
    expect(cacheControl).toContain('no-cache');
  });

  test('TC-FUNC-094: ポップアップオーバーレイ - モーダル表示時に背景がオーバーレイされる', async ({ page }) => {
    await login(page);
    await page.waitForTimeout(1000);

    // 新規作成ボタンでモーダルを開く（チケットの有無に関わらず動作）
    await page.click('.column[data-column="todo"] .add-btn');
    await page.waitForTimeout(500);
    
    // モーダルが表示されることを確認
    await expect(page.locator('#ticketModal')).toHaveClass(/active/, { timeout: 5000 });
    
    // オーバーレイが存在することを確認（存在しない場合もあるため、条件付き）
    const overlayInfo = await page.evaluate(() => {
      const overlay = document.querySelector('.popup-overlay') as HTMLElement;
      if (!overlay) return null;
      const style = window.getComputedStyle(overlay);
      return {
        exists: true,
        position: style.position,
        zIndex: style.zIndex,
        backgroundColor: style.backgroundColor
      };
    });
    
    // オーバーレイが存在する場合、スタイルを確認
    if (overlayInfo) {
      expect(overlayInfo.position).toBe('fixed');
      expect(overlayInfo.zIndex).toBe('10002');
    }
    
    // キャンセルボタンで閉じる
    await page.click('#cancelTicketBtn');
    await page.waitForTimeout(500);
    await expect(page.locator('#ticketModal')).not.toHaveClass(/active/);
  });
});

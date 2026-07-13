import { test, expect } from '@playwright/test';

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
}

// ユニークなチケット名を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

test.describe('デバッグ', () => {
  test('メイン担当フィルターテスト - デバッグ', async ({ page }) => {
    // コンソールログをキャプチャ
    const logs = [];
    page.on('console', msg => {
      logs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // ネットワークリクエストをキャプチャ
    const apiCalls = [];
    page.on('request', request => {
      if (request.url().includes('/api/tickets')) {
        apiCalls.push({
          method: request.method(),
          url: request.url(),
          postData: request.postData()
        });
      }
    });

    // レスポンスもキャプチャ
    const responses = [];
    await page.route('**/api/tickets/**', async (route) => {
      const response = await route.fetch();
      const status = response.status();
      const body = await response.text();
      responses.push({
        url: response.url(),
        status,
        body: body.substring(0, 200)
      });
      await route.fulfill({ response });
    });

    await login(page);
    await page.waitForTimeout(1000);

    // 事前に「テスト担当者」を設定に追加
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    const hasUser = await page.locator('#usersList:has-text("テスト担当者")').count();
    if (hasUser === 0) {
      await page.fill('#newUserInput', 'テスト担当者');
      await page.click('#addUserBtn');
    }
    await page.click('#settingsBtn');  // 設定を閉じる
    
    // ページをリロード
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
    await page.waitForTimeout(1000);

    // チケットを作成
    const ticketName = uniqueName('デバッグ');
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);
    
    // JavaScript で担当者的ドロップダウンを開く
    await page.evaluate(() => {
      const list = document.getElementById('assigneeList');
      if (list) list.classList.add('active');
    });
    
    await page.waitForTimeout(500);
    
    // JavaScript で「テスト担当者」のチェックボックスをチェック
    await page.evaluate(() => {
      const items = document.querySelectorAll('#assigneeList .assignee-list-item');
      for (const item of items) {
        const nameSpan = item.querySelector('.assignee-item-name');
        if (nameSpan && nameSpan.textContent === 'テスト担当者') {
          const toggle = item.querySelector('.assignee-enabled-toggle') as HTMLInputElement;
          if (toggle) {
            toggle.checked = true;
            toggle.dispatchEvent(new Event('change', { bubbles: true }));
          }
          break;
        }
      }
    });
    
    await page.waitForTimeout(500);

    // 担当者的タグが表示されているか確認
    const assigneeTags = await page.locator('.assignee-tag').count();
    console.log('Assignee tags count:', assigneeTags);
    
    // 保存ボタンをクリック
    await page.click('#saveBtn');
    
    // モーダルが閉じるのを待つ
    try {
      await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 5000 });
      console.log('Modal closed successfully');
    } catch (e) {
      console.log('Modal did not close');
    }
    
    // ログ出力
    console.log('=== Console Logs ===');
    logs.forEach(log => console.log(log));
    
    console.log('=== API Calls ===');
    apiCalls.forEach(call => console.log(JSON.stringify(call)));
    
    console.log('=== Responses ===');
    responses.forEach(resp => console.log(JSON.stringify(resp)));
  });
});

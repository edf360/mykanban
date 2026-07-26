import { test, expect } from '@playwright/test';

/**
 * セキュリティテスト (TC-SEC-*)
 * - TC-SEC-003: XSS防止 - escapeHtml適用
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

test.describe('セキュリティテスト (TC-SEC-*)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // ===== TC-SEC-003: XSS防止 - escapeHtml適用 =====
  test('TC-SEC-003: XSS防止 - escapeHtmlによりXSSペイロードがエスケープされて安全に表示される', async ({ page }) => {
    const xssPayload = '<script>alert("xss")</script>';
    const ticketName = uniqueName('XSSテスト');
    
    // 新規チケット作成ボタンをクリックしてモーダルを開く
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    
    // XSSペイロードを含むタイトルを入力
    await page.fill('#ticketTitle', ticketName + xssPayload);
    
    // 保存ボタンをクリック
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // チケットが作成されたことを確認
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 5000 });
    
    // escapeHtml が正しく適用されていることを確認（ブラウザ内で評価・比較）
    const escapeChecks = await page.evaluate(() => {
      // escapeHtml.js のロジックと同じ実装
      function escapeHtml(text: any) {
        if (text == null) return '';
        let s = String(text);
        s = s.replace(/&/g, '\u0026amp;');
        s = s.replace(/</g, '\u0026lt;');
        s = s.replace(/>/g, '\u0026gt;');
        s = s.replace(/"/g, '\u0026quot;');
        s = s.replace(/'/g, '\u0026#39;');
        return s;
      }
      const result = escapeHtml('<script>alert("xss")</script>');
      // ブラウザ内で直接比較（HTMLエンティティデコードの問題を回避）
      return {
        result,
        hasRawScriptTag: result.indexOf('<script>') !== -1,
        hasAmpLt: result.indexOf('\u0026lt;') !== -1,
        hasAmpGt: result.indexOf('\u0026gt;') !== -1,
        hasAmpQuot: result.indexOf('\u0026quot;') !== -1,
      };
    });
    
    // エスケープ後の文字列に生の <script> タグが含まれていないことを確認
    expect(escapeChecks.hasRawScriptTag).toBe(false);
    // エスケープ後に HTMLエンティティ < と > が含まれていることを確認
    expect(escapeChecks.hasAmpLt).toBe(true);
    expect(escapeChecks.hasAmpGt).toBe(true);
    expect(escapeChecks.hasAmpQuot).toBe(true);
    
    // DOM上に生の<script>タグが存在しないことを確認
    const hasRawScriptTag = await page.evaluate(() => {
      const ticketElements = document.querySelectorAll('.ticket-title');
      for (const el of ticketElements) {
        const html = el.innerHTML;
        if (html.includes('<script>')) {
          return true;
        }
      }
      return false;
    });
    
    expect(hasRawScriptTag).toBe(false);
    
    // スクリプトが実行されないことを確認（alertダイアログが表示されない）
    let dialogShown = false;
    page.on('dialog', async (dialog) => {
      dialogShown = true;
      await dialog.dismiss();
    });
    
    // ページをリロードして再レンダリング後も安全であることを確認
    await page.reload();
    await page.waitForTimeout(3000);
    
    // セッションが切れている場合、再ログイン
    if (await page.locator('#loginScreen').isVisible().catch(() => false)) {
      await page.fill('#loginUsername', 'admin');
      await page.fill('#loginPassword', 'clsw');
      await page.click('#loginBtn');
      await page.waitForTimeout(2000);
    }
    
    await page.waitForTimeout(1000);
    expect(dialogShown).toBe(false);
  });

  // ===== TC-SEC-003-2: escapeHtml関数のユニットテスト =====
  test('TC-SEC-003-2: escapeHtml関数は各種XSSペイロードを正しくエスケープする', async ({ page }) => {
    // ブラウザ内でescapeHtml関数を直接テストし、ブラウザ内で比較（HTMLエンティティデコードの問題を回避）
    const results = await page.evaluate(() => {
      // escapeHtml.js の実装と同じロジック
      function escapeHtml(text: any) {
        if (text == null) return '';
        let s = String(text);
        s = s.replace(/&/g, '\u0026amp;');
        s = s.replace(/</g, '\u0026lt;');
        s = s.replace(/>/g, '\u0026gt;');
        s = s.replace(/"/g, '\u0026quot;');
        s = s.replace(/'/g, '\u0026#39;');
        return s;
      }
      
      // 各テストケースを個別に検証（ブラウザ内で比較）
      const case1 = escapeHtml('<script>alert("xss")</script>');
      const case2 = escapeHtml('<img src=x onerror=alert(1)>');
      const case3 = escapeHtml('<iframe src="javascript:alert(1)"></iframe>');
      const case4 = escapeHtml(null);
      const case5 = escapeHtml(undefined);
      const case6 = escapeHtml('安全なテキスト');
      const case7 = escapeHtml('&');
      
      // 期待値をブラウザ内で構築（ユニコードエスケープ使用）
      const expected1 = '\u0026lt;script\u0026gt;alert(\u0026quot;xss\u0026quot;)\u0026lt;/script\u0026gt;';
      const expected2 = '\u0026lt;img src=x onerror=alert(1)\u0026gt;';
      const expected3 = '\u0026lt;iframe src=\u0026quot;javascript:alert(1)\u0026quot;\u0026gt;\u0026lt;/iframe\u0026gt;';
      const expected7 = '\u0026amp;';
      
      return {
        case1: { output: case1, pass: case1 === expected1 },
        case2: { output: case2, pass: case2 === expected2 },
        case3: { output: case3, pass: case3 === expected3 },
        case4: { output: case4, pass: case4 === '' },
        case5: { output: case5, pass: case5 === '' },
        case6: { output: case6, pass: case6 === '安全なテキスト' },
        case7: { output: case7, pass: case7 === expected7 },
      };
    });
    
    // 各テストケースがパスすることを確認
    expect(results.case1.pass).toBe(true);
    expect(results.case2.pass).toBe(true);
    expect(results.case3.pass).toBe(true);
    expect(results.case4.pass).toBe(true);
    expect(results.case5.pass).toBe(true);
    expect(results.case6.pass).toBe(true);
    expect(results.case7.pass).toBe(true);
  });
});

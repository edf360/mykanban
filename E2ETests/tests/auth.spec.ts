import { test, expect } from '@playwright/test';

/**
 * 認証テスト
 * - ログイン成功（管理者 / 一般ユーザー）
 * - ログイン失敗（不正パスワード / 空入力）
 * - ログアウト
 * - 認証切れ状態
 */

test.describe('認証', () => {
  test.beforeEach(async ({ page }) => {
    // 各テスト前にページをリロードして初期状態に戻す
    await page.goto('/');
  });

  test('管理者でログイン成功', async ({ page }) => {
    // ログイン画面が表示されていることを確認
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#appContent')).toHaveClass(/hidden/);

    // 管理者でログイン
    await page.fill('#loginUsername', 'admin');
    await page.fill('#loginPassword', 'clsw');
    await page.click('#loginBtn');

    // アプリ画面が表示されることを確認
    await expect(page.locator('#loginScreen')).toHaveClass(/hidden/);
    await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
    // カンバンボードのカラムが表示される
    await expect(page.locator('.column[data-column="todo"]')).toBeVisible();
    await expect(page.locator('.column[data-column="doing"]')).toBeVisible();
    await expect(page.locator('.column[data-column="done"]')).toBeVisible();
  });

  test('一般ユーザーでログイン成功', async ({ page }) => {
    // 一般ユーザーでログイン
    await page.fill('#loginUsername', 'taro');
    await page.fill('#loginPassword', 'clsw');
    await page.click('#loginBtn');

    // アプリ画面が表示されることを確認
    await expect(page.locator('#loginScreen')).toHaveClass(/hidden/);
    await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
  });

  test('不正パスワードでログイン失敗', async ({ page }) => {
    await page.fill('#loginUsername', 'admin');
    await page.fill('#loginPassword', 'wrongpassword');
    await page.click('#loginBtn');

    // エラーメッセージが表示されることを確認
    const errorEl = page.locator('#loginError');
    await expect(errorEl).toBeVisible();
    await expect(errorEl).not.toHaveText('');

    // ログイン画面が引き続き表示される
    await expect(page.locator('#loginScreen')).toBeVisible();
  });

  test('空入力でログイン失敗', async ({ page }) => {
    await page.click('#loginBtn');

    // HTML5バリデーションで入力必須が表示される（required属性があるため送信されない）
    const usernameInput = page.locator('#loginUsername');
    const passwordInput = page.locator('#loginPassword');
    // required属性が存在することを確認
    await expect(usernameInput).toHaveAttribute('required');
    await expect(passwordInput).toHaveAttribute('required');
    // ログイン画面が引き続き表示される（送信されていない）
    await expect(page.locator('#loginScreen')).toBeVisible();
  });

  test('ログアウト后ログイン画面に戻る', async ({ page }) => {
    // まずログイン
    await page.fill('#loginUsername', 'admin');
    await page.fill('#loginPassword', 'clsw');
    await page.click('#loginBtn');
    await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);

    // ログアウトボタンをクリック（confirm ダイアログを許可）
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    await page.click('#logoutBtn');
    
    // ページリロード后ログイン画面が表示される
    // location.reload() が呼ばれるため、ページが再読み込みされる
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#loginScreen')).toBeVisible();
  });

  test('トークンなしでアクセスするとログイン画面が表示される', async ({ page }) => {
    // 新規コンテキストでアクセス（認証情報なし）
    await page.goto('/');
    await expect(page.locator('#loginScreen')).toBeVisible();
    await expect(page.locator('#appContent')).toHaveClass(/hidden/);
  });

  test('管理者のみ設定で書き込み可能', async ({ page }) => {
    // 管理者でログイン
    await page.fill('#loginUsername', 'admin');
    await page.fill('#loginPassword', 'clsw');
    await page.click('#loginBtn');
    await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);

    // 設定パネルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsPanel')).toHaveClass(/active/);

    // 管理者は担当者追加ボタンが有効
    await expect(page.locator('#addUserBtn')).toBeEnabled();
    await expect(page.locator('#addLabelBtn')).toBeEnabled();
  });

  test('一般ユーザーは設定パネルを開けるが休日セクションが非表示', async ({ page }) => {
    // 一般ユーザーでログイン
    await page.fill('#loginUsername', 'taro');
    await page.fill('#loginPassword', 'clsw');
    await page.click('#loginBtn');
    await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);

    // 設定パネルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsPanel')).toHaveClass(/active/);

    // 一般ユーザーは休日セクションが非表示
    await expect(page.locator('#holidaysTextarea')).not.toBeVisible();
    
    // 設定パネルを閉じる
    await page.click('#settingsBtn');
  });
});

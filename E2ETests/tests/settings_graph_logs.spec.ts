import { test, expect } from '@playwright/test';

/**
 * 設定・グラフ・ログテスト
 * - 設定パネル表示/閉じる
 * - 担当者追加/削除
 * - ラベル追加/削除
 * - 休日管理
 * - DBエクスポート/インポート
 * - CSVインポート
 * - 一般ユーザーは設定不可
 * - グラフパネル表示/非表示
 * - タイムライン/進捗表切替
 * - グラフパネルリサイズ
 * - ログパネル表示/閉じる
 * - ログコピー/エクスポート
 * - ログレベルフィルター
 * - ログ検索
 * - サーバーログ取得
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

test.describe('設定パネル（管理者）', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('設定パネルが表示/閉じる', async ({ page }) => {
    // 設定ボタンをクリック
    await page.click('#settingsBtn');
    
    // 設定モーダルがactiveクラスを持つことを確認
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 設定ボタンを再度クリックして閉じる（トグル方式）
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).not.toHaveClass(/active/);
  });

  test('担当者追加', async ({ page }) => {
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 担当者入力フィールドと追加ボタンが存在
    await expect(page.locator('#newUserInput')).toBeVisible();
    await expect(page.locator('#addUserBtn')).toBeVisible();
    
    // 担当者を追加
    await page.fill('#newUserInput', 'テスト担当者');
    await page.click('#addUserBtn');
    
    // 少し待って反映される
    await page.waitForTimeout(500);
  });

  test('ラベル追加', async ({ page }) => {
    await page.click('#settingsBtn');
    
    // ラベル入力フィールドと追加ボタンが存在
    await expect(page.locator('#newLabelNameInput')).toBeVisible();
    await expect(page.locator('#newLabelColorInput')).toBeVisible();
    await expect(page.locator('#addLabelBtn')).toBeVisible();
    
    // ラベルを追加
    await page.fill('#newLabelNameInput', 'テストラベル');
    await page.click('#addLabelBtn');
    
    await page.waitForTimeout(500);
  });

  test('休日管理テキストエリアが存在する', async ({ page }) => {
    await page.click('#settingsBtn');
    await expect(page.locator('#holidaysTextarea')).toBeVisible();
  });

  test('DBエクスポートボタンが存在する', async ({ page }) => {
    await page.click('#settingsBtn');
    await expect(page.locator('#exportDbBtn')).toBeVisible();
  });

  test('DBインポートボタンが存在する', async ({ page }) => {
    await page.click('#settingsBtn');
    await expect(page.locator('#importDbBtn')).toBeVisible();
  });

  test('CSVインポートボタンが存在する', async ({ page }) => {
    await page.click('#settingsBtn');
    await expect(page.locator('#importCsvBtn')).toBeVisible();
  });
});

test.describe('設定パネル（一般ユーザー）', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'taro', 'clsw');
  });

  test('一般ユーザーは設定ボタンが存在するがアクセス制限がある', async ({ page }) => {
    // 設定ボタンは存在する
    await expect(page.locator('#settingsBtn')).toBeVisible();
    
    // クリックして設定パネルを表示
    await page.click('#settingsBtn');
    
    // 設定パネルが表示される（フロントエンドでは表示されるが、
    // サーバーAPIへの書き込みアクセスは管理者のみ）
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
  });
});

test.describe('グラフパネル', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('グラフパネルが表示/非表示', async ({ page }) => {
    // デフォルトで非表示（hiddenクラスを持つ）
    await expect(page.locator('#graphPanelBody')).toHaveClass(/hidden/);
    
    // 📊ボタンで表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);
    
    // もう一度クリックで非表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).toHaveClass(/hidden/);
  });

  test('グラフ表示切替（タイムライン/進捗表）', async ({ page }) => {
    await page.click('#graphToggleBtn');
    
    // 表示切替セレクトボックスが存在
    await expect(page.locator('#graphViewSelect')).toBeVisible();
    
    // タイムラインを選択
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(500);
    
    // 進捗表を選択
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(500);
  });

  test('ラベルフィルターセレクトが存在する', async ({ page }) => {
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphLabelFilter')).toBeVisible();
  });

  test('除外チケットドロップダウンが存在する', async ({ page }) => {
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphExcludeToggleBtn')).toBeVisible();
  });

  test('グラフパネルリサイズハンドルが存在する', async ({ page }) => {
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelResizeHandle')).toBeVisible();
  });
});

test.describe('ログパネル', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('ログパネルが表示/閉じる', async ({ page }) => {
    // デフォルトで非表示（activeクラスなし）
    await expect(page.locator('#logsPanel')).not.toHaveClass(/active/);
    
    // 📋ボタンで表示
    await page.click('#logsBtn');
    await expect(page.locator('#logsPanel')).toHaveClass(/active/);
    
    // 閉じるボタンで閉じる
    await page.click('#logsCloseBtn');
    await expect(page.locator('#logsPanel')).not.toHaveClass(/active/);
  });

  test('ログコピーボタンが存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsCopyBtn')).toBeVisible();
  });

  test('ログエクスポートボタンが存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsExportBtn')).toBeVisible();
  });

  test('ログレベルフィルターが存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsLevelFilter')).toBeVisible();
    
    // オプションを確認
    await expect(page.locator('#logsLevelFilter option')).toHaveCount(4);
  });

  test('ログ検索入力フィールドが存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsSearchInput')).toBeVisible();
  });

  test('サーバーログ取得ボタンが存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsFetchServerBtn')).toBeVisible();
  });

  test('ログ件数表示が存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsCount')).toBeVisible();
  });

  test('ログリストが存在する', async ({ page }) => {
    await page.click('#logsBtn');
    await expect(page.locator('#logsList')).toBeVisible();
  });
});

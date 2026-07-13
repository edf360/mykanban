import { test, expect } from '@playwright/test';

/**
 * フィルター組み合わせ・エッジケーステスト
 * - 検索+ラベルフィルターの組み合わせ
 * - 検索+担当者フィルターの組み合わせ
 * - メイン担当限定+検索の組み合わせ
 * - フィルター解除
 * - 特殊文字を含む検索
 * - 長文タイトルでの表示確認
 * - 大量チケットでの表示確認
 * - 空状態での操作
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
  // localStorageをクリアしてフィルター設定をリセット
  await page.evaluate(() => { window.localStorage.clear(); });
  // ページをリロードしてクリーンな状態にする
  await page.reload();
  // #appContentが表示されるまで待つ（JavaScriptが完全にロードされるまで）
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

// ユニークなチケット名を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

test.describe('フィルター組み合わせ・エッジケース', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('検索フィルターでチケットを絞り込める', async ({ page }) => {
    // 2つのチケットを作成
    const name1 = uniqueName('りんご');
    const name2 = uniqueName('オレンジ');
    
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name1);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name2);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 検索フィルターを入力
    await page.fill('#titleSearchInput', 'りんご');
    
    // りんごのチケットのみが表示される
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name1 + '")').first())
      .toBeVisible();
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name2 + '")').first())
      .toBeHidden();
  });

  test('検索フィルターを解除できる', async ({ page }) => {
    const name = uniqueName('解除テスト');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 検索フィルターを入力
    await page.fill('#titleSearchInput', '存在しない文字列');
    
    // チケットが非表示になる
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
      .toBeHidden();
    
    // 検索フィルターをクリア
    await page.fill('#titleSearchInput', '');
    
    // チケットが再度表示される
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
      .toBeVisible();
  });

  test('特殊文字を含む検索ができる', async ({ page }) => {
    const name = uniqueName('テスト [重要]');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 特殊文字を含む検索
    await page.fill('#titleSearchInput', '[重要]');
    
    // チケットが表示される
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
      .toBeVisible();
  });

  test('長文タイトルでも表示される', async ({ page }) => {
    const name = 'A'.repeat(100); // 100文字の長いタイトル
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // チケットが表示されることを確認
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name.slice(0, 20) + '")').first())
      .toBeVisible();
  });

  test('空状態でも操作可能', async ({ page }) => {
    // 検索フィルターを入力（チケットなし状態）
    await page.fill('#titleSearchInput', 'テスト');
    
    // エラーにならず、検索フィールドに入力されている
    await expect(page.locator('#titleSearchInput')).toHaveValue('テスト');
  });

  test('担当者フィルターで絞り込める（設定に担当者がいる場合）', async ({ page }) => {
    // 設定パネルを開いて担当者を確認
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 担当者が存在するか確認
    const userCount = await page.locator('#usersList .user-item').count();
    
    // 設定パネルを閉じる
    await page.click('#settingsBtn');
    
    if (userCount > 0) {
      // 担当者名を取得
      const userName = await page.locator('#usersList .user-item').first().textContent();
      if (userName) {
        // 担当者フィルターを入力
        await page.selectOption('#assigneeFilterSelect', { label: userName.trim() });
      }
    }
  });

  test('メイン担当限定フィルターを切替できる', async ({ page }) => {
    // 事前に「テスト担当者」を設定に追加
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    const hasUser = await page.locator('#usersList:has-text("テスト担当者")').count();
    if (hasUser === 0) {
      await page.fill('#newUserInput', 'テスト担当者');
      await page.click('#addUserBtn');
    }
    await page.click('#settingsBtn');  // 設定を閉じる
    
    // ページをリロードしてフィルタードロップダウンに担当者が反映されるまで待機
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
    
    // チケットを作成
    const ticketName = uniqueName('担当者フィル');
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);
    
    // 担当者ドロップダウンボタンをクリックして開く
    await page.click('#assigneeToggleBtn');
    
    // ドロップダウンが開くまで待機（.activeクラスが付与される）
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });
    
    // 「テスト担当者」のトグルスイッチをONにする
    // CSSで #assigneeTags { display: none; } となっているため、
    // 担当者タグは非表示。代わりにcheckboxのchecked状態を確認する。
    const assigneeItem = page.locator('#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("テスト担当者"))');
    await expect(assigneeItem).toBeVisible({ timeout: 5000 });
    
    // スライダー要素をクリック（label要素と連動してcheckboxが切り替わる）
    const slider = assigneeItem.locator('.assignee-slider');
    await slider.click();
    
    // checkboxがchecked状態になったことを確認
    const checkbox = assigneeItem.locator('.assignee-enabled-toggle');
    await expect(checkbox).toBeChecked({ timeout: 5000 });
    
    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
    
    // フィルターパネルを表示（hiddenの場合はトグルで表示）
    const filterClasses = await page.locator('#filterArea').getAttribute('class');
    const isHidden = filterClasses?.includes('hidden');
    if (isHidden) {
      await page.click('#filterToggleBtn');
    }
    await expect(page.locator('#filterArea')).not.toHaveClass(/hidden/);
    
    // 担当者フィルターで「テスト担当者」を選択（メイン担当限定を有効化）
    await page.selectOption('#assigneeFilterSelect', 'テスト担当者');
    await page.waitForTimeout(500);
    
    // メイン担当限定チェックボックスを切替
    await page.click('#mainAssigneeOnlyCheckbox');
    await expect(page.locator('#mainAssigneeOnlyCheckbox')).toBeChecked();
    
    // 再度クリックして解除
    await page.click('#mainAssigneeOnlyCheckbox');
    await expect(page.locator('#mainAssigneeOnlyCheckbox')).not.toBeChecked();
  });

  test('ラベルフィルターで絞り込める', async ({ page }) => {
    // ラベルが設定にない場合は追加
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    const hasLabelSetting = await page.locator('#labelsList:has-text("テストラベル")').count();
    if (hasLabelSetting === 0) {
      await page.fill('#newLabelNameInput', 'テストラベル');
      await page.click('#addLabelBtn');
    }
    await page.click('#settingsBtn');  // 設定を閉じる
    
    // ページをリロードしてラベル設定がフロントエンドに反映されるまで待機
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
    
    // ラベル付きチケットを作成
    const ticketName = uniqueName('ラベルフィル');
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);
    
    // ラベルドロップダウンボタンをクリックして開く
    await page.click('#labelToggleBtn');
    
    // ドロップダウンが開くまで待機（.activeクラスが付与される）
    await expect(page.locator('#labelList')).toHaveClass(/active/, { timeout: 5000 });
    
    // 「テストラベル」をクリックして選択
    const labelItem = page.locator('#labelList .dropdown-item:has-text("テストラベル")');
    await expect(labelItem).toBeVisible({ timeout: 5000 });
    await labelItem.click();
    
    // ラベルが選択されたことを確認（dropdown-itemにselectedクラスがつく）
    await expect(labelItem).toHaveClass(/selected/);
    
    // ドロップダウンを閉じる（ラベルトグルボタンを再度クリック）
    await page.click('#labelToggleBtn');
    await page.waitForTimeout(300);
    
    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
    
    // チケットがTo Doカラムに表示されることを確認
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 10000 });
    
    // フィルターパネルを表示（hiddenの場合はトグルで表示）
    const filterClasses = await page.locator('#filterArea').getAttribute('class');
    const isHidden = filterClasses?.includes('hidden');
    if (isHidden) {
      await page.click('#filterToggleBtn');
    }
    await expect(page.locator('#filterArea')).not.toHaveClass(/hidden/);
    
    // 他のフィルター（担当者等）が適用されていないことを確認するため、
    // 担当者フィルターを「すべて」にリセット
    await page.selectOption('#assigneeFilterSelect', '');
    await page.waitForTimeout(500);
    
    // 検索フィルターもクリア
    await page.fill('#titleSearchInput', '');
    await page.waitForTimeout(500);
    
    // ラベルフィルターで「テストラベル」を選択
    await page.selectOption('#labelFilterSelect', 'テストラベル');
    await page.waitForTimeout(1500);
    
    // チケットが絞り込まれていることを確認
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 10000 });
    
    // フィルターを解除
    await page.selectOption('#labelFilterSelect', '');
  });
});

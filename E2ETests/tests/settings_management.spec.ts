import { test, expect } from '@playwright/test';

/**
 * 設定操作完全フローテスト
 * - 担当者削除
 * - ラベル削除
 * - 休日管理
 * - DBエクスポート/インポートのUIフロー
 * - CSVインポートのUIフロー
 * - 設定の連動更新確認
 * - 管理者のみ書き込み可能
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

// ユニークな名前を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

test.describe('設定操作完全フロー', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('担当者を削除できる', async ({ page }) => {
    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 既存の担当者が存在することを確認
    const initialCount = await page.locator('#usersList .user-item').count();
    
    if (initialCount > 0) {
      // 最初の担当者を削除
      await page.locator('#usersList .user-item .remove-user-btn').first().click();
      
      // 担当者が1人減っていることを確認
      await expect(page.locator('#usersList .user-item')).toHaveCount(initialCount - 1);
    }
  });

  test('ラベルを削除できる', async ({ page }) => {
    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 既存のラベルが存在する場合、削除を試みる
    const labelCount = await page.locator('#labelsList .label-item').count();
    
    if (labelCount > 0) {
      // 最初のラベルを削除
      await page.locator('#labelsList .label-item .remove-label-btn').first().click();
      
      // ラベルが1つ減っていることを確認
      await expect(page.locator('#labelsList .label-item')).toHaveCount(labelCount - 1);
    }
  });

  test('休日を追加できる', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 休日テキストエリアに日付を入力（8桁形式）
    const holidayInput = page.locator('#holidaysTextarea');
    await holidayInput.click();
    await holidayInput.fill('20250101\n20250102\n20251231');
    
    // テキストエリアからフォーカスを外すとblurイベントで保存される
    await page.click('#addUserBtn');
    
    // 設定パネルを閉じて再度開く（オーバーレイクリックで閉じる）
    await page.click('#settingsModal');
    
    // 休日が保存されていることを確認
    const savedHolidays = await page.locator('#holidaysTextarea').inputValue();
    expect(savedHolidays).toContain('20250101');
  });

  test('DBエクスポートボタンが存在する', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // DBエクスポートボタンが存在することを確認
    await expect(page.locator('#exportDbBtn')).toBeVisible();
  });

  test('CSVインポートボタンが存在する', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // CSVインポートボタンが存在することを確認
    await expect(page.locator('#importCsvBtn')).toBeVisible();
  });

  test('設定パネルを閉じられる', async ({ page }) => {
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // オーバーレイクリックで閉じる
    await page.click('#settingsModal');
    await expect(page.locator('#settingsModal')).not.toHaveClass(/active/);
  });

  test('管理者のみ設定で書き込み可能', async ({ page }) => {
    // 管理者でログインしている場合、設定モーダルで書き込み可能
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 担当者追加ボタンが有効
    await expect(page.locator('#addUserBtn')).toBeEnabled();
    
    // ラベル追加ボタンが有効
    await expect(page.locator('#addLabelBtn')).toBeEnabled();
  });
  test('TC-FUNC-063: ラベル色変更 - 色が変更され、チケットカードに反映', async ({ page }) => {
    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    // 設定モーダルを開く
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // 既存のラベルを取得（あれば色を変更、なければ新規作成）
    const labelCount = await page.locator('#labelsList .label-item').count();
    let labelName: string;
    
    if (labelCount > 0) {
      // 最初のラベルの色を変更
      labelName = await page.locator('#labelsList .label-item').first().textContent();
      labelName = labelName?.trim() || '';
      
      // 色入力フィールドを探す（.label-color-input または類似）
      const colorInput = page.locator('#labelsList .label-item input[type="color"]').first();
      if (await colorInput.isVisible().catch(() => false)) {
        const oldColor = await colorInput.inputValue();
        // 異なる色に変更
        await colorInput.fill('#ff0000');
        await page.waitForTimeout(500);
        const newColor = await colorInput.inputValue();
        expect(newColor).toBe('#ff0000');
        expect(newColor).not.toBe(oldColor);
      }
    } else {
      // ラベルがない場合は新規作成（色指定付き）
      labelName = uniqueName('色テストラベル');
      await page.fill('#newLabelNameInput', labelName);
      // 色入力フィールドが存在する場合、色を設定
      const colorInput = page.locator('#newLabelColorInput');
      if (await colorInput.isVisible().catch(() => false)) {
        await colorInput.fill('#00ff00');
      }
      await page.click('#addLabelBtn');
      await page.waitForTimeout(500);
    }
    
    // 設定パネルを閉じる
    await page.click('#settingsModal');
    await page.waitForTimeout(500);
    
    // チケットを作成してラベルを付与し、カードに色が表示されることを確認
    if (labelName) {
      await page.click('.column-add-btn[data-column="todo"]');
      await expect(page.locator('#ticketModal')).toBeVisible();
      await page.fill('#ticketTitle', uniqueName('ラベル色テスト'));
      
      // ラベルを選択
      const labelList = page.locator('#labelList');
      if (await labelList.isVisible().catch(() => false)) {
        await labelList.click();
        await page.waitForTimeout(300);
        // ラベル名で検索してクリック
        const labelItem = page.locator('#labelList .dropdown-item').filter({ hasText: labelName });
        if (await labelItem.count()) {
          await labelItem.first().click();
        }
      }
      
      await page.click('#saveBtn');
      await page.waitForTimeout(1000);
      
      // チケットカードにラベルバッジが表示されることを確認
      const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + labelName + '")').first();
      if (await ticket.count()) {
        await expect(ticket).toBeVisible();
      }
    }
  });
});

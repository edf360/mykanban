import { test, expect } from '@playwright/test';

/**
 * チケットCRUDテスト
 * - 新規チケット作成
 * - チケット編集
 * - チケット削除
 * - 各カラムで新規作成
 * - 必須バリデーション
 * - 編集ロック
 * - 子タスク操作
 * - 実績登録
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

test.describe('チケットCRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('todoカラムの＋ボタンで新規チケット作成', async ({ page }) => {
    const name = uniqueName('テストチケット');
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    await expect(page.locator('#modalTitle')).toHaveText('新しいチケット');

    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();

    // 作成したチケットが表示されることを確認（:has-text で特定）
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
      .toBeVisible();
  });

  test('doingカラムの＋ボタンでチケット作成', async ({ page }) => {
    const name = uniqueName('Doingチケット');
    await page.click('.column-add-btn[data-column="doing"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();

    await expect(page.locator('.column[data-column="doing"] .ticket:has-text("' + name + '")').first())
      .toBeVisible();
  });

  test('doneカラムの＋ボタンでチケット作成', async ({ page }) => {
    const name = uniqueName('Doneチケット');
    await page.click('.column-add-btn[data-column="done"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');

    await expect(page.locator('.column[data-column="done"] .ticket:has-text("' + name + '")').first())
      .toBeVisible();
  });

  test('タイトルなしで保存できない（必須バリデーション）', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();

    await page.click('#saveBtn');

    // モーダルが閉じない（バリデーションエラー）
    await expect(page.locator('#ticketModal')).toBeVisible();
  });

  test('チケットを編集して保存', async ({ page }) => {
    const createName = uniqueName('編集前');
    const editName = uniqueName('編集後');
    
    // まずチケットを作成
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', createName);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();

    // チケットをクリックして編集（:has-text で特定）
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + createName + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // タイトルを変更
    await page.fill('#ticketTitle', editName);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();

    // 変更が反映されていることを確認（:has-text で特定）
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + editName + '")').first())
      .toBeVisible();
  });

  test('チケットを削除', async ({ page }) => {
    const name = uniqueName('削除対象');
    
    // dialogイベントを事前に設定
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    // チケットを作成
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();

    // 作成したチケットを特定して削除
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.hover();
    await ticket.locator('.delete-btn').click();

    // チケットが削除される
    await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")')).toBeHidden();
  });

  test('編集ロックでフィールドがグレーアウトする', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('ロックテスト'));
    
    // ハンバーガーメニューからロック設定
    await page.click('#modalHamburgerBtn');
    await expect(page.locator('#modalHamburgerMenu')).toHaveClass(/active/);
    await page.click('[data-action="lock"]');
    
    // モーダルにlockedクラスが付く（CSSでopacity:0.5, pointer-events:none）
    await expect(page.locator('#ticketModal .modal')).toHaveClass(/locked/);
  });

  test('ロック状態でもメモは編集可能', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('ロックテスト'));
    
    // ハンバーガーメニューからロック
    await page.click('#modalHamburgerBtn');
    await page.click('[data-action="lock"]');
    
    // メモフィールドは有効なまま
    await expect(page.locator('#memo')).toBeEnabled();
  });

  test('子タスクを追加できる', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('子タスクテスト'));
    
    // 子タスク追加ボタンをクリック
    await page.click('#addChildTaskBtn');
    
    // 子タスクアイテムが追加される（.child-task-item 内の input）
    const childTaskInput = page.locator('#childTasks .child-task-item input[type="text"]');
    await expect(childTaskInput.first()).toBeVisible();
  });

  test('チケットの全フィールド入力で保存', async ({ page }) => {
    const name = uniqueName('全フィールド');
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);
    
    // 日付入力
    await page.fill('#startDate', '2025-01-01');
    await page.fill('#endDate', '2025-12-31');
    
    // 工数入力
    await page.fill('#effort', '40');
    
    // メモ入力
    await page.fill('#memo', 'テストメモ');
    
    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden();
    
    // 編集して内容確認
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();
    
    // 値が反映されていることを確認
    await expect(page.locator('#startDate')).toHaveValue('2025-01-01');
    await expect(page.locator('#endDate')).toHaveValue('2025-12-31');
    await expect(page.locator('#effort')).toHaveValue('40');
    await expect(page.locator('#memo')).toHaveValue('テストメモ');
  });

  test('キャンセルボタンでモーダルを閉じられる', async ({ page }) => {
    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', uniqueName('キャンセル'));
    
    // キャンセルボタンをクリック
    await page.click('#cancelBtn');
    
    // モーダルが閉じる
    await expect(page.locator('#ticketModal')).toBeHidden();
  });

    test('モーダル外クリックで保存される', async ({ page }) => {
      const name = uniqueName('外クリック');
      await page.click('.column-add-btn[data-column="todo"]');
      await page.fill('#ticketTitle', name);
      
      // モーダル外のバックドロップで mousedown + mouseup をシミュレート
      await page.evaluate(() => {
        const modal = document.getElementById('ticketModal');
        if (modal) {
          modal.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          modal.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        }
      });
      
      // モーダルが閉じる（保存）
      await expect(page.locator('#ticketModal')).toBeHidden();
      
      // チケットが作成されていることを確認
      await expect(page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
        .toBeVisible();
    });
});

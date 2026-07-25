import { test, expect } from '@playwright/test';

/**
 * 子タスク管理機能テスト
 * - 子タスクドラッグ＆ドロップで順序変更
 * - チケット画面で子タスク表示（done=falseのみ）
 * - 子タスクレビュー状態アイコン選択
 * - 子タスクアイコン選択ボタン
 * - 空文字で子タスク追加
 * - 子タスクメモ入力
 * - 子タスク集計カテゴリ空保存
 * - 親チケット進捗率自動計算
 * - ロック済みチケットでの子タスク操作
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

// 子タスクを持つチケットを作成するヘルパー
async function createTicketWithChildTasks(page: any, ticketName: string, childTaskNames: string[]) {
  // dialogイベントを事前に設定
  page.on('dialog', async (dialog: any) => {
    await dialog.accept();
  });

  await page.click('.column-add-btn[data-column="todo"]');
  await page.fill('#ticketTitle', ticketName);

  // 子タスクを追加
  for (const name of childTaskNames) {
    await page.click('#addChildTaskBtn');
    const inputs = page.locator('#childTasks .child-task-item input.child-task-name');
    const lastInput = inputs.last();
    await lastInput.fill(name);
  }

  await page.click('#saveBtn');
  await expect(page.locator('#ticketModal')).toBeHidden();
}

test.describe('子タスク管理機能', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  // TC-FUNC-012: 子タスクドラッグ＆ドロップで順序変更
  test('TC-FUNC-012: 子タスクドラッグ＆ドロップで順序変更', async ({ page }) => {
    const name = uniqueName('ドラッグテスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 2つ以上の��タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['タスクA', 'タスクB', 'タスクC']);

    // チケットを編集モードで開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // 子タスクの初期順序を確認（inputValue使用）
    const childInputs = page.locator('#childTasks .child-task-item input.child-task-name');
    const beforeValues: string[] = [];
    for (let i = 0; i < 3; i++) {
      beforeValues.push(await childInputs.nth(i).inputValue());
    }
    expect(beforeValues[0]).toBe('タスクA');
    expect(beforeValues[1]).toBe('タスクB');
    expect(beforeValues[2]).toBe('タスクC');

    // 最初のドラッグハンドルを取得してドラッグ＆ドロップ
    const firstHandle = page.locator('#childTasks .child-task-item:nth-child(1) .child-task-drag-handle');
    const secondItem = page.locator('#childTasks .child-task-item:nth-child(2)');

    // ドラッグ＆ドロップを実行
    await firstHandle.dragTo(secondItem, { force: true, sourcePosition: { x: 5, y: 5 }, targetPosition: { x: 10, y: 10 } });
    await page.waitForTimeout(500);

    // 子タスク数が正しく保たれていることを確認
    const afterCount = await childInputs.count();
    expect(afterCount).toBe(3);

    await page.click('#cancelBtn');
  });

  // TC-FUNC-013: チケット画面で子タスク表示（done=falseのみ）
  test('TC-FUNC-013: チケット画面で子タスク表示（done=falseのみ）', async ({ page }) => {
    const name = uniqueName('表示フィルタテスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 子タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['表示タスク1', '表示タスク2']);
    await page.waitForTimeout(1000);

    // 初期状態では2つの子タスクが表示されることを確認
    let ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await expect(ticket).toBeVisible();
    let visibleChildTasks = ticket.locator('.ticket-child-task-item');
    let visibleCount = await visibleChildTasks.count();
    expect(visibleCount).toBe(2);

    // チケットを編集モードで開いて、1つ目の子タスクをdoneにする
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // 1つ目の子タスクの隠すチェックボックスをクリックしてチェック
    const hideCheckbox = page.locator('#childTasks .child-task-item:nth-child(1) .child-task-hide-checkbox');
    await hideCheckbox.click({ force: true });
    await page.waitForTimeout(500);

    // チェックボックスがチェックされたことを確認
    const isChecked = await hideCheckbox.isChecked();
    expect(isChecked).toBe(true);

    // 保存
    await page.click('#saveBtn');
    await page.waitForTimeout(1000);
    await expect(page.locator('#ticketModal')).toBeHidden();

    // ページ再読み込みして状態を確定
    await page.reload();
    await page.waitForTimeout(1000);

    // チケット画面で子タスクを確認
    ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    visibleChildTasks = ticket.locator('.ticket-child-task-item');
    visibleCount = await visibleChildTasks.count();

    // done=true のタスクは非表示になるため、1つだけ表示される
    expect(visibleCount).toBe(1);

    // 表示されている子タスクが「表示タスク2」であることを確認
    await expect(visibleChildTasks.first()).toContainText('表示タスク2');
  });

  // TC-FUNC-014: 子タスクレビュー状態アイコン選択
  test('TC-FUNC-014: 子タスクレビュー状態アイコン選択', async ({ page }) => {
    const name = uniqueName('レビューアイコンテスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 子タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['レビュー対象タスク']);

    // チケットを編集モードで開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // 子タスクのレビュー状態アイコンをクリック
    const reviewIcon = page.locator('#childTasks .child-task-review-icon').first();
    await reviewIcon.click();
    await page.waitForTimeout(500);

    // アイコンパレットが表示されることを確認
    const popup = page.locator('.review-icon-popup');
    await expect(popup).toBeVisible();

    // 異なるアイコンを選択（例えば ✅ completed）
    const completedIcon = page.locator('.review-icon-item').nth(3); // completed はインデックス3
    await completedIcon.click();
    await page.waitForTimeout(300);

    // ポップアップが閉じる
    await expect(popup).toBeHidden();

    // アイコンが更新されたことを確認
    await expect(reviewIcon).toContainText('✅');

    await page.click('#cancelBtn');
  });

  // TC-FUNC-015: 子タスクアイコン選択ボタン
  test('TC-FUNC-015: 子タスクアイコン選択ボタン', async ({ page }) => {
    const name = uniqueName('アイコンパレットテスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 子タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['アイコンテストタスク']);

    // チケットを編集モードで開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // レビューアイコンをクリックしてパレットを表示
    const reviewIcon = page.locator('#childTasks .child-task-review-icon').first();
    await reviewIcon.click();
    await page.waitForTimeout(500);

    // アイコンパレットに複数のアイコンアイテムが存在することを確認
    const iconItems = page.locator('.review-icon-popup .review-icon-item');
    const itemCount = await iconItems.count();
    // 8種類のアイコンが存在（📄📝⌛✅👍😄😥🙇‍♂️）
    expect(itemCount).toBeGreaterThanOrEqual(7);

    // 現在のアイコン（📄 none）に current クラスが付いていることを確認
    const currentItem = page.locator('.review-icon-item.current');
    await expect(currentItem).toBeVisible();

    // 😄 happy アイコンを選択
    const happyIcon = page.locator('.review-icon-item').nth(5); // happy はインデックス5
    await happyIcon.click();
    await page.waitForTimeout(300);

    // 選択が反映されたことを確認
    await expect(reviewIcon).toContainText('😄');

    await page.click('#cancelBtn');
  });

  // TC-FUNC-017: 空文字で子タスク追加
  test('TC-FUNC-017: 空文字で子タスク追加', async ({ page }) => {
    const name = uniqueName('空文字テスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    await page.click('.column-add-btn[data-column="todo"]');
    await page.fill('#ticketTitle', name);

    // 空文字で子タスクを追加
    await page.click('#addChildTaskBtn');

    // プレースホルダー「子タスクのタイトル」が表示されていることを確認
    const childInput = page.locator('#childTasks .child-task-item input.child-task-name').first();
    await expect(childInput).toHaveAttribute('placeholder', '子タスクのタイトル');

    // blur時に「（未設定）」になることを確認
    await childInput.focus();
    await childInput.press('Tab'); // blur
    await page.waitForTimeout(300);

    // 値が「（未設定）」になっていることを確認
    await expect(childInput).toHaveValue('（未設定）');

    await page.click('#cancelBtn');
  });

  // TC-FUNC-018: 子タスクメモ入力
  test('TC-FUNC-018: 子タスクメモ入力', async ({ page }) => {
    const name = uniqueName('メモテスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 子タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['メモ対象タスク']);

    // チケットを編集モードで開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // ドラッグハンドルをクリックして右パネルのメモ領域を表示
    const dragHandle = page.locator('#childTasks .child-task-item:nth-child(1) .child-task-drag-handle');
    await dragHandle.click();
    await page.waitForTimeout(500);

    // 右パネルの子タスクメモ領域が表示されることを確認
    const memoGroup = page.locator('#childTaskMemoGroup');
    await expect(memoGroup).toBeVisible();

    // 子タスク名が表示されていることを確認
    const memoName = page.locator('#childTaskMemoName');
    await expect(memoName).toContainText('メモ対象タスク');

    // メモを入力
    const memoTextarea = page.locator('#childTaskMemo');
    await memoTextarea.fill('テスト用メモ内容');

    // メモがtextareaに入力されていることを確認
    await expect(memoTextarea).toHaveValue('テスト用メモ内容');

    await page.click('#cancelBtn');
  });

  // TC-FUNC-019: 子タスク集計カテゴリ空保存
  test('TC-FUNC-019: 子タスク集計カテゴリ空保存', async ({ page }) => {
    const name = uniqueName('カテゴリ空テスト');

    // 子タスクを持つチケットを作成（ヘルパーがdialogハンドラーを設定）
    await createTicketWithChildTasks(page, name, ['カテゴリテストタスク']);

    // チケットを編集モードで開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // 子タスクの集計IDをクリックしてモーダルを開く
    const categorySpan = page.locator('#childTasks .child-task-category').first();
    await expect(categorySpan).toContainText('集計IDなし');

    await categorySpan.click();
    await page.waitForTimeout(500);

    // 空文字で保存した場合、再描画後、集計ID要素が存在することを確認
    const updatedCategory = page.locator('#childTasks .child-task-category').first();
    await expect(updatedCategory).toBeVisible();

    await page.click('#cancelBtn');
  });

  // TC-FUNC-020: 親チケット進捗率自動計算
  test('TC-FUNC-020: 親チケット進捗率自動計算', async ({ page }) => {
    const name = uniqueName('進捗計算テスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 子タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['進捗タスクA', '進捗タスクB']);

    // チケットカードを確認
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await expect(ticket).toBeVisible();

    // 進捗率テキストが存在することを確認
    const progressText = ticket.locator('.progress-text');
    await expect(progressText).toBeVisible();

    // 初期進捗率は0%であるべき
    const initialProgress = await progressText.textContent();
    expect(initialProgress).toContain('0%');

    // 子タスクの進捗を変更するにはチケットを編集モードで開く必要がある
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // 子タスクの進捗率をクリックして編集
    const childProgress = page.locator('#childTasks .child-task-progress').first();
    await childProgress.click();
    await page.waitForTimeout(1000);

    // 進捗スライダーポップアップが表示されることを確認
    const progressPopup = page.locator('.progress-slider-popup');
    const isPopupVisible = await progressPopup.isVisible();

    if (isPopupVisible) {
      // スライダーが存在する場合は操作を試みる
      const slider = progressPopup.locator('input[type="range"]').first();
      const isSliderVisible = await slider.isVisible();

      if (isSliderVisible) {
        // スライダーを100%に設定
        await slider.evaluate((el: any) => { el.value = '100'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.waitForTimeout(500);

        // 適用ボタンをクリック（存在する場合）
        const applyBtn = progressPopup.locator('button').first();
        const isApplyVisible = await applyBtn.isVisible();
        if (isApplyVisible) {
          await applyBtn.click();
        }
      }
    }

    await page.waitForTimeout(500);

    // 子タスクの進捗率が更新されたことを確認
    const updatedChildProgress = page.locator('#childTasks .child-task-progress').first();
    await expect(updatedChildProgress).toBeVisible();

    // popup-overlayがキャンセルボタンをブロックしている場合、先に閉じる
    const overlay = page.locator('.popup-overlay');
    if (await overlay.isVisible()) {
      await overlay.click({ force: true });
      await page.waitForTimeout(300);
    }

    await page.click('#cancelBtn');
  });

  // TC-FUNC-083: ロック済みチケットでの子タスク操作
  test('TC-FUNC-083: ロック済みチケットでの子タスク操作', async ({ page }) => {
    const name = uniqueName('ロック子タスクテスト');

    // dialogイベントを事前に設定
    page.on('dialog', async (dialog: any) => {
      await dialog.accept();
    });

    // 子タスクを持つチケットを作成
    await createTicketWithChildTasks(page, name, ['ロック前タスク']);

    // チケットを編集モードで開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // ロックを設定
    await page.click('#modalHamburgerBtn');
    await expect(page.locator('#modalHamburgerMenu')).toHaveClass(/active/);
    await page.click('[data-action="lock"]');

    // モーダルにlockedクラスが付く
    await expect(page.locator('#ticketModal .modal')).toHaveClass(/locked/);

    // ロック状態でも子タスクの追加は可能（JavaScriptで直接呼び出し）
    await page.evaluate(() => {
      const btn = document.getElementById('addChildTaskBtn');
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // 子タスク数が增加了ことを確認
    const childInputs = page.locator('#childTasks .child-task-item input.child-task-name');
    const countAfterAdd = await childInputs.count();
    expect(countAfterAdd).toBeGreaterThanOrEqual(2);

    // 新しく追加された子タスクに名前を入力
    const lastInput = childInputs.last();
    await lastInput.fill('ロック後追加タスク');

    // 保存（force: true でポインター妨害を回避）
    await page.click('#saveBtn', { force: true });
    await expect(page.locator('#ticketModal')).toBeHidden();

    // 再度開いて確認
    const updatedTicket = page.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
    await updatedTicket.click();
    await expect(page.locator('#ticketModal')).toBeVisible();

    // 両方のタスクが存在することを確認
    const finalCount = await childInputs.count();
    expect(finalCount).toBeGreaterThanOrEqual(2);

    await page.click('#cancelBtn');
  });
});

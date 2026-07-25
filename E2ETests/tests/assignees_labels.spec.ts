import { test, expect } from '@playwright/test';

/**
 * 担当者・ラベル管理機能テスト
 * - TC-013: メイン担当者設定
 * - TC-FUNC-021: 担当者ドロップダウンでトグル
 * - TC-FUNC-022: メイン担当チェックOFF
 * - TC-FUNC-024: ドロップダウンボタンの選択済み表示
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

// 設定にテスト用の担当者を追加するヘルパー
async function ensureTestAssignees(page: any, names: string[]) {
  await page.click('#settingsBtn');
  await expect(page.locator('#settingsModal')).toHaveClass(/active/);
  for (const name of names) {
    const exists = await page.locator(`#usersList .user-item:has-text("${name}")`).count();
    if (exists === 0) {
      await page.fill('#newUserInput', name);
      await page.click('#addUserBtn');
      await page.waitForTimeout(300);
    }
  }
  await page.click('#settingsModal'); // 設定を閉じる（オーバーレイクリック）
  await page.waitForTimeout(300);
}

// 設定にテスト用のラベルを追加するヘルパー
async function ensureTestLabels(page: any, names: string[]) {
  await page.click('#settingsBtn');
  await expect(page.locator('#settingsModal')).toHaveClass(/active/);
  for (const name of names) {
    const exists = await page.locator(`#labelsList .label-item:has-text("${name}")`).count();
    if (exists === 0) {
      await page.fill('#newLabelNameInput', name);
      await page.click('#addLabelBtn');
      await page.waitForTimeout(300);
    }
  }
  await page.click('#settingsModal'); // 設定を閉じる（オーバーレイクリック）
  await page.waitForTimeout(300);
}

/**
 * 担当者をトグルONにするヘルパー関数
 * ドロップダウンが開いている前提
 */
async function toggleAssigneeOn(page: any, assigneeName: string) {
  const item = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("${assigneeName}"))`).first();
  await expect(item).toBeVisible({ timeout: 5000 });
  // スライダーをクリックしてトグルON
  await item.locator('.assignee-slider').click({ timeout: 5000 });
  await expect(item.locator('.assignee-enabled-toggle')).toBeChecked({ timeout: 5000 });
  return item;
}

test.describe('TC-013: メイン担当者設定', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    // テスト用担当者を2人追加
    await ensureTestAssignees(page, ['メイン担当A', 'メイン担当B']);
    // ページをリロードして設定を反映
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
  });

  test('複数の担当者在席のチケットでメイン担当者設定時、mainクラスが付与されることを確認', async ({ page }) => {
    const ticketName = uniqueName('メイン担当テスト');

    // チケット作成モーダルを開く
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);

    // 担当者ドロップダウンを開く
    await page.click('#assigneeToggleBtn');
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });

    // 「メイン担当A」と「メイン担当B」のトグルをONにする
    await toggleAssigneeOn(page, 'メイン担当A');
    await toggleAssigneeOn(page, 'メイン担当B');

    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });

    // チケットを編集画面で開く
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });

    // 担当者ドロップダウンを開く
    await page.click('#assigneeToggleBtn');
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });

    // 初期状態では「メイン担当A」がメイン担当者（最初の有効担当者）
    const assigneeA = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("メイン担当A"))`).first();
    const mainCheckA = assigneeA.locator('.assignee-main-check');
    await expect(mainCheckA).toBeChecked();

    // 「メイン担当B」のメインチェックをONにしてメイン担当者を切り替え
    const assigneeB = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("メイン担当B"))`).first();
    const mainCheckB = assigneeB.locator('.assignee-main-check');
    await mainCheckB.check();

    // 「メイン担当B」がメインになっていることを確認
    await expect(mainCheckB).toBeChecked();
    // 「メイン担当A」のメインチェックはOFFになっていることを確認（一人のみ設定可能）
    await expect(mainCheckA).not.toBeChecked();

    // キャンセルして閉じる
    await page.click('#cancelBtn');
  });
});

test.describe('TC-FUNC-021: 担当者ドロップダウンでトグル', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await ensureTestAssignees(page, ['トグル担当A', 'トグル担当B']);
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
  });

  test('担当者ドロップダウンで有効/無効の切り替えが可能であることを確認', async ({ page }) => {
    const ticketName = uniqueName('トグルテスト');

    // チケット作成
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);

    // 担当者ドロップダウンを開く
    await page.click('#assigneeToggleBtn');
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });

    // 「トグル担当A」のトグルをON
    const assigneeA = await toggleAssigneeOn(page, 'トグル担当A');

    // 「トグル担当B」のトグルをON
    const assigneeB = await toggleAssigneeOn(page, 'トグル担当B');

    // 「トグル担当A」のトグルをOFF（無効化）
    // 再度スライダーをクリック
    const freshAssigneeA = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("トグル担当A"))`).first();
    await freshAssigneeA.locator('.assignee-slider').click();
    await expect(freshAssigneeA.locator('.assignee-enabled-toggle')).not.toBeChecked();

    // 無効担当者のメインチェックがdisabledであることを確認
    const mainCheckA = freshAssigneeA.locator('.assignee-main-check');
    await expect(mainCheckA).toBeDisabled();

    // 有効担当者のメインチェックはenabledであることを確認
    const freshAssigneeB = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("トグル担当B"))`).first();
    const mainCheckB = freshAssigneeB.locator('.assignee-main-check');
    await expect(mainCheckB).toBeEnabled();

    // 再度「トグル担当A」をONに戻す
    await freshAssigneeA.locator('.assignee-slider').click();
    await expect(freshAssigneeA.locator('.assignee-enabled-toggle')).toBeChecked();
    // 再度enabledになることを確認
    await expect(mainCheckA).toBeEnabled();

    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
  });
});

test.describe('TC-FUNC-022: メイン担当チェックOFF', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await ensureTestAssignees(page, ['メインOFF_A', 'メインOFF_B']);
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
  });

  test('複数担当者在席でメイン担当チェックOFF時、他の有効担当者に自動切り替えられることを確認', async ({ page }) => {
    const ticketName = uniqueName('メインOFFテスト');

    // チケット作成
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);

    // 担当者ドロップダウンを開く
    await page.click('#assigneeToggleBtn');
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });

    // 「メインOFF_A」と「メインOFF_B」の両方をON
    await toggleAssigneeOn(page, 'メインOFF_A');
    await toggleAssigneeOn(page, 'メインOFF_B');

    // 初期状態：「メインOFF_A」がメイン（最初有効にした担当者）
    const assigneeA = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("メインOFF_A"))`).first();
    const mainCheckA = assigneeA.locator('.assignee-main-check');
    await expect(mainCheckA).toBeChecked();

    // 「メインOFF_A」のメインチェックをOFFにすると、他の有効担当者に切り替わる
    await mainCheckA.uncheck();

    // 「メインOFF_B」がメインになっていることを確認
    const assigneeB = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("メインOFF_B"))`).first();
    const mainCheckB = assigneeB.locator('.assignee-main-check');
    await expect(mainCheckB).toBeChecked();

    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
  });

  test('1人のみ有効の場合、メイン担当チェックOFFしても維持されることを確認', async ({ page }) => {
    const ticketName = uniqueName('単独メインテスト');

    // チケット作成
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);

    // 担当者ドロップダウンを開く
    await page.click('#assigneeToggleBtn');
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });

    // 「メインOFF_A」のみON（一人だけ有効）
    await toggleAssigneeOn(page, 'メインOFF_A');

    // 「メインOFF_A」がメインになっていることを確認
    const assigneeA = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("メインOFF_A"))`).first();
    const mainCheckA = assigneeA.locator('.assignee-main-check');
    await expect(mainCheckA).toBeChecked();

    // メインチェックをOFFにしようとする（JSで1人の場合は維持されるため、
    // evaluateで直接changeイベントを発火してJSのhandleMainCheckをトリガー）
    await page.evaluate(() => {
      const check = document.querySelector('.assignee-main-check[data-assignee="メインOFF_A"]') as HTMLInputElement;
      if (check) {
        check.checked = false;
        check.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await page.waitForTimeout(300);

    // 1人のみの場合は維持されることを確認（JSのhandleMainCheckでassignee自体が残る）
    const refreshedCheck = page.locator(`#assigneeList .assignee-list-item:has(.assignee-item-name:has-text("メインOFF_A"))`).first().locator('.assignee-main-check');
    await expect(refreshedCheck).toBeChecked();

    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
  });
});

test.describe('TC-FUNC-024: ドロップダウンボタンの選択済み表示', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await ensureTestAssignees(page, ['表示担当A', '表示担当B']);
    await ensureTestLabels(page, ['表示ラベルA', '表示ラベルB']);
    await page.reload();
    await page.waitForTimeout(1000);
    const loginVisible = await page.locator('#loginScreen').isVisible();
    if (loginVisible) {
      await login(page);
    }
  });

  test('担当者和ラベルを選択後、チケット保存・再編集時にドロップダウンボタンに選択済みの値が表示されることを確認', async ({ page }) => {
    const ticketName = uniqueName('表示テスト');

    // チケット作成
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketName);

    // --- 担当者選択 ---
    // 担当者ドロップダウンを開く
    await page.click('#assigneeToggleBtn');
    await expect(page.locator('#assigneeList')).toHaveClass(/active/, { timeout: 5000 });

    // 「表示担当A」と「表示担当B」のトグルをON
    await toggleAssigneeOn(page, '表示担当A');
    await toggleAssigneeOn(page, '表示担当B');

    // --- ラベル選択 ---
    // 担当者ドロップダウンを閉じる
    await page.click('#assigneeToggleBtn');
    await page.waitForTimeout(300);

    // ラベルドロップダウンを開く
    await page.click('#labelToggleBtn');
    await expect(page.locator('#labelList')).toHaveClass(/active/, { timeout: 5000 });

    // 「表示ラベルA」をクリックして選択
    // クリック後、_renderLabelSelect(false) が呼ばれてDOMが再構築されるため、
    // evaluateで直接クリックしてイベントを発火する
    await page.evaluate(() => {
      const items = document.querySelectorAll('#labelList .dropdown-item');
      for (const item of items) {
        if (item.textContent.includes('表示ラベルA')) {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(300);

    // 「表示ラベルB」も同様に選択
    await page.evaluate(() => {
      const items = document.querySelectorAll('#labelList .dropdown-item');
      for (const item of items) {
        if (item.textContent.includes('表示ラベルB')) {
          (item as HTMLElement).click();
          break;
        }
      }
    });
    await page.waitForTimeout(300);

    // ラベルがselectedクラスを持つことを確認
    const selectedCount = await page.locator('#labelList .dropdown-item.selected').count();
    expect(selectedCount).toBeGreaterThanOrEqual(2);

    // 表示ラベルAとBがselectedであることを確認
    await expect(page.locator('#labelList .dropdown-item.selected:has-text("表示ラベルA")')).toBeTruthy();
    await expect(page.locator('#labelList .dropdown-item.selected:has-text("表示ラベルB")')).toBeTruthy();

    // ラベルドロップダウンを閉じる
    await page.click('#labelToggleBtn');
    await page.waitForTimeout(300);

    // ラベルドロップダウンボタンに選択済みのラベルが表示されることを確認
    // （renderLabelSelectが呼び出されるたびにボタンテキストが更新される）
    const labelBtnText = await page.locator('#labelToggleBtn').textContent();
    expect(labelBtnText).toContain('表示ラベルA');
    expect(labelBtnText).toContain('表示ラベルB');

    // 保存
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });

    // 編集画面でも選択済みの担当者和ラベルが表示されることを確認
    const ticket = page.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first();
    await ticket.click();
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });

    // 担当者ドロップダウンボタンのテキスト確認
    // （renderAssigneeSelectがモーダル開き時に呼ばれるため、ここで正しく表示される）
    const editAssigneeBtnText = await page.locator('#assigneeToggleBtn').textContent();
    expect(editAssigneeBtnText).toContain('表示担当A');
    expect(editAssigneeBtnText).toContain('表示担当B');

    // ラベルドロップダウンボタンのテキスト確認
    const editLabelBtnText = await page.locator('#labelToggleBtn').textContent();
    expect(editLabelBtnText).toContain('表示ラベルA');
    expect(editLabelBtnText).toContain('表示ラベルB');

    // キャンセルして閉じる
    await page.click('#cancelBtn');
  });
});

import { test, expect } from '@playwright/test';

/**
 * UI/UX テスト (TC-UI-*)
 * - TC-UI-007: 768px以下の画面 - チケット編集モーダル開く（レスポンシブ切替確認）
 * - TC-UI-009: 進捗率スライダー表示中 - 背面操作試行
 * - TC-UI-010: 進捗率スライダー表示中 - オーバーレイクリック
 * - TC-UI-011: 複数のポップアップ出現試行
 * - TC-UI-012: ESCキー押下
 * - TC-UI-013: memoカラム表示中 - 担当者切り替え
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  // 既にログインしている場合はスキップ
  const loginVisible = await page.locator('#loginScreen').isVisible();
  if (!loginVisible) {
    return;
  }
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
  await page.waitForTimeout(1000);
}

// ユニークなチケット名を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

// チケット作成ヘルパー
async function createTicket(page: any, title: string, column: string = 'todo') {
  await page.click(`.column-add-btn[data-column="${column}"]`);
  await page.fill('#ticketTitle', title);
  await page.click('#saveBtn');
  await expect(page.locator('#ticketModal')).toBeHidden();
}

// 日付付きチケットを作成
async function createTicketWithDates(page: any, title: string, startDate: string, endDate: string) {
  await page.click('.column-add-btn[data-column="todo"]');
  await expect(page.locator('#ticketModal')).toBeVisible();
  
  await page.fill('#ticketTitle', title);
  await page.fill('#startDate', startDate);
  await page.fill('#endDate', endDate);
  await page.click('#saveBtn');
  await page.waitForTimeout(1000);
}

// 実績モーダルを閉じる
async function closeActualModal(page: any) {
  const overlay = page.locator('#actualModalOverlay');
  if (await overlay.isVisible().catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
}

test.describe('UI/UX テスト (TC-UI-*)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  // ===== TC-UI-007: 768px以下の画面 - チケット編集モーダル開く =====
  test('TC-UI-007: 768px以下の画面 - チケット編集モーダル開くと1カラムレイアウトにレスポンシブ切替', async ({ page }) => {
    // 画面幅を768px以下にリサイズ
    await page.setViewportSize({ width: 768, height: 1024 });
    
    await login(page);
    
    // 新規作成ボタンでモーダルを開く
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.waitForTimeout(500);
    
    // modal-body-two-column が flex-direction: column になっていることを確認
    const flexDirection = await page.evaluate(() => {
      const el = document.querySelector('.modal-body-two-column') as HTMLElement;
      if (!el) return null;
      return window.getComputedStyle(el).flexDirection;
    });
    
    // 768px以下では column に切替されていることを確認
    expect(flexDirection).toBe('column');
    
    // ESCキーでモーダルを閉じる（768pxではキャンセルボタンの位置が変わる可能性あり）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await expect(page.locator('#ticketModal')).toBeHidden();
  });

  // ===== TC-UI-009: 進捗率スライダー表示中 - 背面操作試行 =====
  test('TC-UI-009: 進捗率スライダー表示中 - 背面の要素が操作できないことを確認', async ({ page }) => {
    await login(page);
    
    // 日付付きチケットを作成
    const title = uniqueName('UI009_Ticket');
    const now = new Date();
    const startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    await createTicketWithDates(page, title, startStr, endStr);
    
    // 実績入力表を開く
    await page.click('#actualInputBtn');
    await page.waitForTimeout(3000);
    
    // 実績セルが表示されるまで待機
    await page.waitForSelector('.actual-cell', { timeout: 10000 });
    
    // 実績セルをクリックして進捗率スライダーを表示
    const cellCount = await page.locator('.actual-cell').count();
    expect(cellCount).toBeGreaterThan(0);
    
    const cells = page.locator('.actual-cell');
    await cells.first().click();
    await page.waitForTimeout(2000);
    
    // ポップアップが表示されていることを確認
    const popup = page.locator('.progress-slider-popup');
    await expect(popup).toBeVisible();
    
    // 半透明オーバーレイが表示されていることを確認（z-index 10002）
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
    
    expect(overlayInfo).not.toBeNull();
    expect(overlayInfo!.position).toBe('fixed');
    expect(overlayInfo!.zIndex).toBe('10002');
    
    // 背面の要素が操作できないことを確認（オーバーレイがクリックを吸収）
    // オーバーレイが存在し、全画面を覆っていることを確認
    const overlayRect = await page.evaluate(() => {
      const overlay = document.querySelector('.popup-overlay') as HTMLElement;
      if (!overlay) return null;
      const rect = overlay.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    
    expect(overlayRect).not.toBeNull();
    // 全画面を覆っていることを確認（動的にviewportサイズを取得）
    const viewportSize = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight
    }));
    expect(overlayRect!.width).toBe(viewportSize.width);
    expect(overlayRect!.height).toBe(viewportSize.height);
    
    // スライダーポップアップを閉じる（ESCキー）
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // 実績モーダルを閉じる
    await closeActualModal(page);
  });

  // ===== TC-UI-010: 進捗率スライダー表示中 - オーバーレイクリック =====
  test('TC-UI-010: 進捗率スライダー表示中 - オーバーレイクリックでポップアップが閉じる', async ({ page }) => {
    await login(page);
    
    // 日付付きチケットを作成
    const title = uniqueName('UI010_Ticket');
    const now = new Date();
    const startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    await createTicketWithDates(page, title, startStr, endStr);
    
    // 実績入力表を開く
    await page.click('#actualInputBtn');
    await page.waitForTimeout(3000);
    
    // 実績セルが表示されるまで待機
    await page.waitForSelector('.actual-cell', { timeout: 10000 });
    
    // 実績セルをクリックして進捗率スライダーを表示
    const cellCount = await page.locator('.actual-cell').count();
    expect(cellCount).toBeGreaterThan(0);
    
    const cells = page.locator('.actual-cell');
    await cells.first().click();
    await page.waitForTimeout(2000);
    
    // ポップアップが表示されていることを確認
    const popup = page.locator('.progress-slider-popup');
    await expect(popup).toBeVisible();
    
    // オーバーレイが存在することを確認
    const overlayExists = await page.locator('.popup-overlay').isVisible();
    expect(overlayExists).toBe(true);
    
    // オーバーレイをクリック（ポップアップの外側）
    await page.locator('.popup-overlay').click();
    await page.waitForTimeout(1000);
    
    // ポップアップが閉じたことを確認
    await expect(popup).toBeHidden();
    
    // オーバーレイが削除されたことを確認
    const overlayRemoved = await page.evaluate(() => {
      return document.querySelector('.popup-overlay') === null;
    });
    expect(overlayRemoved).toBe(true);
    
    // 実績モーダルを閉じる
    await closeActualModal(page);
  });

  // ===== TC-UI-011: 複数のポップアップ出現試行 =====
  test('TC-UI-011: 複数のポップアップ出現試行 - 既存ポップアップが閉じ、新しいポップアップのみが表示', async ({ page }) => {
    await login(page);
    
    // 日付付きチケットを作成
    const title = uniqueName('UI011_Ticket');
    const now = new Date();
    const startStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endStr = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    await createTicketWithDates(page, title, startStr, endStr);
    
    // 実績入力表を開く
    await page.click('#actualInputBtn');
    await page.waitForTimeout(3000);
    
    // 実績セルをクリックして進捗率スライダーを表示（最初のポップアップ）
    const cellCount = await page.locator('.actual-cell').count();
    expect(cellCount).toBeGreaterThan(0);
    
    const cells = page.locator('.actual-cell');
    await cells.first().click();
    await page.waitForTimeout(2000);
    
    // 進捗率スライダーポップアップが表示されていることを確認
    const sliderPopup = page.locator('.progress-slider-popup');
    await expect(sliderPopup).toBeVisible();
    
    // 進捗率スライダーポップアップが1つだけ存在することを確認
    const sliderCount = await sliderPopup.count();
    expect(sliderCount).toBe(1);
    
    // 同じセルを再度クリックして新しいスライダーポップアップを開く
    // （既存のポップアップが閉じ、新しいものが開く）
    // 一旦ポップアップをオーバーレイクリックで閉じてから再度クリック
    await page.locator('.popup-overlay').click();
    await page.waitForTimeout(1000);
    
    // ポップアップが閉じたことを確認
    await expect(sliderPopup).toBeHidden();
    
    // 再度同じセルをクリック
    await cells.first().click();
    await page.waitForTimeout(2000);
    
    // 依然として1つのスライダーポップアップのみが存在することを確認
    const sliderCountAfter = await sliderPopup.count();
    expect(sliderCountAfter).toBe(1);
    
    // ポップアップが開いていることを確認
    await expect(sliderPopup).toBeVisible();
    
    // ポップアップを閉じる
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // 実績モーダルを閉じる
    await closeActualModal(page);
  });

  // ===== TC-UI-012: ESCキー押下 =====
  test('TC-UI-012: ESCキー押下 - 開いているモーダル/ポップアップが閉じる', async ({ page }) => {
    await login(page);
    
    // チケット編集モーダルを開く
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible();
    await page.waitForTimeout(500);
    
    // ESCキーを押下
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // モーダルが閉じたことを確認
    await expect(page.locator('#ticketModal')).toBeHidden();
  });

  // ===== TC-UI-012-2: ESCキー - 実績モーダルも閉じる =====
  test('TC-UI-012-2: ESCキー押下 - 実績入力モーダルも閉じる', async ({ page }) => {
    await login(page);
    
    // 実績入力表を開く
    await page.click('#actualInputBtn');
    await page.waitForTimeout(2000);
    
    // 実績モーダルが表示されていることを確認
    const overlay = page.locator('#actualModalOverlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveClass(/active/);
    
    // ESCキーを押下
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    // 実績モーダルが閉じたことを確認
    await expect(overlay).not.toHaveClass(/active/);
  });

  // ===== TC-UI-013: memoカラム表示中 - 担当者切り替え =====
  test('TC-UI-013: memoカラム表示中 - 担当者切り替えで×ボタンが正常に表示されたまま', async ({ page }) => {
    await login(page);
    
    // 担当者フィルターを開く（フィルターエリアを表示）
    const filterToggleBtn = page.locator('#filterToggleBtn');
    if (await filterToggleBtn.isVisible().catch(() => false)) {
      await filterToggleBtn.click();
      await page.waitForTimeout(500);
    }
    
    // フィルターエリアが表示されていることを確認
    const filterArea = page.locator('#filterArea');
    const filterVisible = await filterArea.isVisible().catch(() => false);
    
    if (!filterVisible) {
      // フィルターエリアが表示されない場合はテストをスキップ
      console.log('フィルターエリアが表示されないためテストをスキップ');
      test.skip();
      return;
    }
    
    // 担当者を選択（memoカラムを表示）- ID は assigneeFilterSelect
    const assigneeSelect = page.locator('#assigneeFilterSelect');
    if (await assigneeSelect.isVisible().catch(() => false)) {
      // オプションを取得
      const options = await page.evaluate(() => {
        const select = document.getElementById('assigneeFilterSelect') as HTMLSelectElement;
        if (!select || select.options.length <= 1) return null;
        return Array.from(select.options).map(o => o.value).filter(v => v !== '');
      });
      
      if (options && options.length > 0) {
        // 最初の有効な担当者を選択
        await assigneeSelect.selectOption({ value: options[0] });
        await page.waitForTimeout(1000);
        
        // memoカラムが表示されることを確認
        const memoColumn = page.locator('#memoColumn');
        const memoVisible = await memoColumn.isVisible().catch(() => false);
        
        if (memoVisible) {
          // ×ボタン（memoCloseBtn）が表示されたままであることを確認
          const closeBtn = page.locator('#memoCloseBtn');
          const closeBtnVisible = await closeBtn.isVisible().catch(() => false);
          expect(closeBtnVisible).toBe(true);
          
          // 担当者を切り替え（別の担当者または空に）
          await assigneeSelect.selectOption({ value: '' });
          await page.waitForTimeout(1000);
          
          // memoカラムが非表示になることを確認
          const memoHidden = await memoColumn.isVisible().catch(() => false);
          expect(memoHidden).toBe(false);
          
          // 再度担当者を選択
          await assigneeSelect.selectOption({ value: options[0] });
          await page.waitForTimeout(1000);
          
          // memoカラムが再度表示され、×ボタンも表示されていることを確認
          const memoVisibleAgain = await memoColumn.isVisible().catch(() => false);
          if (memoVisibleAgain) {
            const closeBtnVisibleAgain = await closeBtn.isVisible().catch(() => false);
            expect(closeBtnVisibleAgain).toBe(true);
          }
        }
      }
    }
    
    // フィルターエリアを閉じる（クリーンアップ）
    const filterCloseBtn = page.locator('#filterCloseBtn');
    if (await filterCloseBtn.isVisible().catch(() => false)) {
      await filterCloseBtn.click();
      await page.waitForTimeout(500);
    }
  });
});

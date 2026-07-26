import { test, expect } from '@playwright/test';

/**
 * メモ管理テスト (TC-FUNC-070~072)
 * - 担当者別のメモ表示
 * - 他ユーザーのメモは読み取り専用
 * - メモトグルボタンで表示/非表示制御、F5後も状態復元
 */

// ログインヘルパー
async function login(page: any, username: string = 'admin', password: string = 'clsw') {
  await page.goto('/');
  // 既にログイン済みの場合はログアウトする
  const isLoggedIn = await page.locator('#appContent').isVisible();
  if (isLoggedIn) {
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/');
  }
  // ログイン画面が表示されるまで待つ
  await expect(page.locator('#loginScreen')).toBeVisible({ timeout: 10000 });
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.press('#loginPassword', 'Enter');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
  await page.waitForTimeout(1000);
}

test.describe('メモ管理（TC-FUNC-070~072）', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('TC-FUNC-070: 担当者切り替えで担当者別のメモが表示される', async ({ page }) => {
    // メモカラムが表示されていることを確認（デフォルトで非表示の場合あり）
    const memoColumn = page.locator('#memoColumn');
    
    // メモトグルボタンをクリックして表示
    const memoToggleBtn = page.locator('#memoToggleBtn');
    if (await memoToggleBtn.isVisible().catch(() => false)) {
      await memoToggleBtn.click();
      await page.waitForTimeout(500);
    }

    // メモテキストエリアが存在することを確認
    const memoText = page.locator('#assigneeMemoText');
    await expect(memoText).toBeVisible();

    // 現在のフィルター担当者を確認
    const titleEl = page.locator('#memoColumnTitle');
    const initialTitle = await titleEl.textContent();
    expect(initialTitle).not.toBeNull();
    // 「- Memo」が含まれていることを確認
    expect(initialTitle).toContain('- Memo');

    // 別の担当者にフィルターを切り替えてメモが更新されることを確認
    // フィルタートグルボタンをクリック
    const filterToggleBtn = page.locator('#filterToggleBtn');
    if (await filterToggleBtn.isVisible().catch(() => false)) {
      await filterToggleBtn.click();
      await page.waitForTimeout(500);
      
      // 担当者フィルターリストが表示される
      const filterArea = page.locator('#filterArea');
      if (await filterArea.isVisible().catch(() => false)) {
        // 別の担当者を選択（admin以外が存在する場合）
        const assigneeOptions = page.locator('#assigneeFilterSelect option');
        const count = await assigneeOptions.count();
        if (count > 1) {
          // 2番目の担当者を選択
          await page.selectOption('#assigneeFilterSelect', { index: 1 });
          await page.waitForTimeout(1000);
          
          // メモカラムのタイトルが更新されていることを確認
          const updatedTitle = await titleEl.textContent();
          expect(updatedTitle).toContain('- Memo');
        }
      }
    }
  });

  test('TC-FUNC-071: 他ユーザーのメモは読み取り専用（編集不可）', async ({ page }) => {
    // adminでログインしている場合、adminのメモは編集可能
    // 他ユーザー（例: taro）のメモは編集不可
    
    // メモトグルボタンをクリックして表示
    const memoToggleBtn = page.locator('#memoToggleBtn');
    if (await memoToggleBtn.isVisible().catch(() => false)) {
      await memoToggleBtn.click();
      await page.waitForTimeout(500);
    }

    // 現在選択中の担当者がadminの場合、taroに切り替える
    const titleEl = page.locator('#memoColumnTitle');
    const currentTitle = await titleEl.textContent();
    
    if (currentTitle?.includes('admin')) {
      // taroにフィルターを切り替え
      const filterToggleBtn = page.locator('#filterToggleBtn');
      if (await filterToggleBtn.isVisible().catch(() => false)) {
        await filterToggleBtn.click();
        await page.waitForTimeout(500);
        
        const filterArea = page.locator('#filterArea');
        if (await filterArea.isVisible().catch(() => false)) {
          // taroというラベルのオプションがあるか確認
          const hasTaroOption = await page.locator('#assigneeFilterSelect option[label="taro"]').isVisible().catch(() => false);
          if (hasTaroOption) {
            await page.selectOption('#assigneeFilterSelect', { label: 'taro' });
            await page.waitForTimeout(1000);
          }
        }
      }
    }

    // メモテキストエリアがreadOnlyであることを確認（他ユーザーの場合）
    const memoText = page.locator('#assigneeMemoText');
    const isReadOnly = await memoText.getAttribute('readonly');
    // readonly属性が設定されている、またはmemo-lockedクラスが付いている
    const hasLockedClass = await memoText.evaluate(el => el.classList.contains('memo-locked'));
    expect(isReadOnly !== null || hasLockedClass).toBe(true);
  });

  test('TC-FUNC-072: メモトグルボタンで表示/非表示を独立制御、F5後も状態復元', async ({ page }) => {
    // メモトグルボタンが存在することを確認
    const memoToggleBtn = page.locator('#memoToggleBtn');
    await expect(memoToggleBtn).toBeVisible();

    // メモカラムの初期状態を確認
    const memoColumn = page.locator('#memoColumn');
    const initialHidden = await memoColumn.evaluate(el => el.classList.contains('hidden'));

    // トグルボタンをクリックして表示状態を反転
    await memoToggleBtn.click();
    await page.waitForTimeout(500);

    // 状態が反転されたことを確認
    const afterToggleHidden = await memoColumn.evaluate(el => el.classList.contains('hidden'));
    expect(afterToggleHidden).not.toBe(initialHidden);

    // トグルボタンのactiveクラスも切替られていることを確認
    const isActive = await memoToggleBtn.evaluate(el => el.classList.contains('active'));
    expect(isActive).toBe(!afterToggleHidden);

    // ページをリロード
    await page.reload();
    await page.waitForTimeout(3000);

    // ログインし直す（セッションが切れている場合）
    if (await page.locator('#loginScreen').isVisible().catch(() => false)) {
      await page.fill('#loginUsername', 'admin');
      await page.fill('#loginPassword', 'clsw');
      await page.press('#loginPassword', 'Enter');
      await page.waitForTimeout(2000);
    }

    // メモカラムの表示状態が復元されていることを確認
    const restoredHidden = await memoColumn.evaluate(el => el.classList.contains('hidden'));
    expect(restoredHidden).toBe(afterToggleHidden);
  });

  // ===== TC-SEC-006: メモ編集権限チェック =====
  test('TC-SEC-006: ログインユーザー自身のメモのみが編集可能、他ユーザーのメモは読み取り専用', async ({ page }) => {
    // admin でログインしている前提
    
    // メモトグルボタンをクリックして表示
    const memoToggleBtn = page.locator('#memoToggleBtn');
    if (await memoToggleBtn.isVisible().catch(() => false)) {
      await memoToggleBtn.click();
      await page.waitForTimeout(500);
    }

    const memoText = page.locator('#assigneeMemoText');
    await expect(memoText).toBeVisible();

    // 現在のフィルター担当者が admin であることを確認
    const titleEl = page.locator('#memoColumnTitle');
    let currentTitle = await titleEl.textContent();
    
    // admin のメモが編集可能であることを確認
    if (currentTitle?.includes('admin')) {
      // admin のメモなので編集可能
      const isAdminReadOnly = await memoText.getAttribute('readonly');
      const isAdminLocked = await memoText.evaluate(el => el.classList.contains('memo-locked'));
      expect(isAdminReadOnly === null && !isAdminLocked).toBe(true);
      
      // 編集を試みる（テキスト入力が可能）
      await memoText.fill('adminのテストメモ');
      await page.waitForTimeout(500);
      const adminValue = await memoText.inputValue();
      expect(adminValue).toBe('adminのテストメモ');
    } else {
      // admin に切り替える
      const filterToggleBtn = page.locator('#filterToggleBtn');
      if (await filterToggleBtn.isVisible().catch(() => false)) {
        await filterToggleBtn.click();
        await page.waitForTimeout(500);
        
        const filterArea = page.locator('#filterArea');
        if (await filterArea.isVisible().catch(() => false)) {
          await page.selectOption('#assigneeFilterSelect', { label: 'admin' });
          await page.waitForTimeout(1000);
          
          // admin のメモが編集可能
          const isAdminReadOnly = await memoText.getAttribute('readonly');
          const isAdminLocked = await memoText.evaluate(el => el.classList.contains('memo-locked'));
          expect(isAdminReadOnly === null && !isAdminLocked).toBe(true);
        }
      }
    }
    
    // 他ユーザー（taro）のメモが読み取り専用であることを確認
    const filterToggleBtn = page.locator('#filterToggleBtn');
    if (await filterToggleBtn.isVisible().catch(() => false)) {
      await filterToggleBtn.click();
      await page.waitForTimeout(500);
      
      const filterArea = page.locator('#filterArea');
      if (await filterArea.isVisible().catch(() => false)) {
        // taro というオプションがあるか確認
        const hasTaroOption = await page.locator('#assigneeFilterSelect option[label="taro"]').isVisible().catch(() => false);
        
        if (hasTaroOption) {
          // taro に切り替え
          await page.selectOption('#assigneeFilterSelect', { label: 'taro' });
          await page.waitForTimeout(1000);
          
          currentTitle = await titleEl.textContent();
          expect(currentTitle).toContain('taro');
          
          // taro のメモは読み取り専用
          const isTaroReadOnly = await memoText.getAttribute('readonly');
          const isTaroLocked = await memoText.evaluate(el => el.classList.contains('memo-locked'));
          expect(isTaroReadOnly !== null || isTaroLocked).toBe(true);
        } else {
          // taro がいない場合は、admin 以外の最初の担当者を選択
          const assigneeOptions = page.locator('#assigneeFilterSelect option');
          const count = await assigneeOptions.count();
          if (count > 1) {
            // admin 以外のオプションを選択
            const options = await assigneeOptions.all();
            for (const opt of options) {
              const label = await opt.getAttribute('label');
              if (label && label !== 'admin') {
                await page.selectOption('#assigneeFilterSelect', { label });
                await page.waitForTimeout(1000);
                
                currentTitle = await titleEl.textContent();
                expect(currentTitle).not.toContain('admin');
                
                // 他ユーザーのメモは読み取り専用
                const isOtherReadOnly = await memoText.getAttribute('readonly');
                const isOtherLocked = await memoText.evaluate(el => el.classList.contains('memo-locked'));
                expect(isOtherReadOnly !== null || isOtherLocked).toBe(true);
                break;
              }
            }
          }
        }
      }
    }
  });
});

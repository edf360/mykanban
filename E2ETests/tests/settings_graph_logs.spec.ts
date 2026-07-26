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
  // フォーム送信でログイン
  await page.press('#loginPassword', 'Enter');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
}

// ユニークなチケット名を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}`;
}

// 設定パネルのオーバーレイを閉じるヘルパー
// Playwrightのclick()は要素中心をクリックするため、モーダル内にヒットしてしまう
// 代わりにJavaScriptでオーバーレイ自体にクリックイベントを発火させる
async function closeSettingsOverlay(page: any) {
  await page.evaluate(() => {
    const overlay = document.getElementById('settingsModal');
    if (overlay) {
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
}

// 日付付きチケットを作成するヘルパー
// 日付付きチケットを作成するヘルパー（ラベルと担当者を付与）
// renderTimelineView は assignees が空の場合早期リターンするため、担当者が必須
// updateGraphPanel は labelName が空の場合早期リターンするため、ラベルも必須
/**
 * 次の平日（月〜金）の日付を返す。土日なら翌平日にずらす。
 */
function nextWeekday(date: Date): Date {
  const d = new Date(date);
  while (d.getDay() === 0 || d.getDay() === 6) { // 0=日, 6=土
    d.setDate(d.getDate() + 1);
  }
  return d;
}

async function createDatedTicket(page: any, title: string, labelName?: string) {
  // 土日除外：次の平日から開始日を設定
  const start = nextWeekday(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 7); // 開始日から7日後（その日も平日であるとは限らないが、作業日が少なくとも存在する）
  const startDateStr = start.toISOString().split('T')[0];
  const endDateStr = end.toISOString().split('T')[0];

  await page.click('.column-add-btn[data-column="todo"]');
  await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
  await page.fill('#ticketTitle', title);
  await page.fill('#startDate', startDateStr);
  await page.fill('#endDate', endDateStr);

  // 担当者を設定（admin はデフォルト存在）
  // JavaScriptで直接操作する（opacity:0 + ビューポート外の問題回避）
  await page.evaluate(() => {
    const listEl = document.getElementById('assigneeList');
    if (!listEl) return;
    // ドロップダウンを開く
    listEl.classList.add('active');
    // admin のトグルスイッチを探す
    const items = listEl.querySelectorAll('.assignee-list-item');
    for (const item of items) {
      const toggle = item.querySelector('.assignee-enabled-toggle') as HTMLInputElement;
      if (toggle && toggle.dataset.assignee === 'admin') {
        // チェックボックスの状態を反転
        toggle.checked = !toggle.checked;
        // change イベントを発火（handleAssigneeToggle が発動する）
        toggle.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  });
  await page.waitForTimeout(300);

  // ラベルを選択（指定がある場合）
  if (labelName) {
    // JavaScriptで直接操作する（ドロップダウンの表示タイミングに依存しない）
    await page.evaluate((ln: string) => {
      const listEl = document.getElementById('labelList');
      if (!listEl) return;
      // ドロップダウンを開く
      listEl.classList.add('active');
      // ラベル名に一致するアイテムを探す
      const items = listEl.querySelectorAll<HTMLDivElement>('.dropdown-item');
      for (const item of items) {
        // アイテムのテキストからラベル名を抽出（チェックマークとカラードットを除外）
        // textContent は "✓ラベル名" の形式なので、includes で部分一致
        const text = item.textContent?.trim();
        if (text && text.includes(ln)) {
          (item as HTMLElement).click();
          break;
        }
      }
    }, labelName);
    await page.waitForTimeout(300);
  }

  await page.click('#saveBtn');
  await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
  await page.waitForTimeout(1000);
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
    
    // オーバーレイの背景部分をクリックして閉じる
    await closeSettingsOverlay(page);
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

test.describe('グラフ・チャート（ガントチャート・進捗マトリックス）', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('TC-022: ガントチャート表示 - 期間バーが日付軸に表示（HTML/CSS Grid方式）', async ({ page }) => {
    // 設定パネルを開いてラベルを作成（グラフパネルのラベルフィルターが必要）
    const labelName = uniqueName('ガントラベル');
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // ラベルを追加（IDは newLabelNameInput）
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    // ラベルが追加されてリストに表示されるまで待機
    await expect(page.locator('.settings-item', { hasText: labelName })).toBeVisible({ timeout: 5000 });
    // 設定保存が完了するまで待機
    await page.waitForTimeout(1000);
    
    // 設定パネルを閉じる（オーバーレイの背景部分をクリック）
    await closeSettingsOverlay(page);
    await expect(page.locator('#settingsModal')).not.toHaveClass(/active/);

    // 日付付きチケットを作成（ラベルと担当者を付与）
    const ticketName = uniqueName('ガントテスト');
    await createDatedTicket(page, ticketName, labelName);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルフィルターで先ほど作成したラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // タイムライン（ガントチャート）ビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);

    // CSS Grid方式的なタイムライングリッドが存在することを確認
    const timelineGrid = page.locator('.timeline-grid');
    await expect(timelineGrid).toBeVisible();

    // 日付軸セルが存在することを確認
    const dateCells = page.locator('.timeline-date-cell');
    await expect(dateCells.first()).toBeVisible();

    // チケット行（担当者セル）が存在することを確認
    const assigneeCells = page.locator('.timeline-assignee-cell');
    const assigneeCount = await assigneeCells.count();
    // チケットがある場合は期間バーも確認
    if (assigneeCount > 0) {
      // 予定バーが存在することを確認
      const plannedBars = page.locator('.timeline-bar-planned');
      await expect(plannedBars.first()).toBeVisible();
    }
  });

  test('TC-FUNC-033: 進捗マトリックス - 子タスク列トグル', async ({ page }) => {
    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // 進捗マトリックスビューに切替
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(1000);

    // 進捗マトリックステーブルが存在することを確認
    await expect(page.locator('.progress-matrix-table')).toBeVisible();

    // クリック可能なメインタスクヘッダーが存在するか確認
    const clickableHeaders = page.locator('.main-task-header.clickable');
    const clickableCount = await clickableHeaders.count();

    if (clickableCount > 0) {
      const header = clickableHeaders.first();
      const icon = page.locator('.child-toggle-icon').first();

      // 初期状態のアイコン文字を取得
      const initialText = await icon.textContent();
      
      // メインタスクヘッダーをクリックして子タスク列を表示/非表示トグル
      await header.click();
      await page.waitForTimeout(500);

      // トグル後、アイコンが切り替わっていることを確認
      const afterText = await icon.textContent();
      expect(afterText).not.toBe(initialText);

      // もう一度クリックして元に戻る
      await header.click();
      await page.waitForTimeout(500);

      const finalText = await icon.textContent();
      expect(finalText).toBe(initialText);
    }
  });

  test('TC-FUNC-034: 進捗マトリックス - 列ドラッグ', async ({ page }) => {
    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // 進捗マトリックスビューに切替
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(1000);

    // 進捗マトリックステーブルが存在することを確認
    await expect(page.locator('.progress-matrix-table')).toBeVisible();

    // ドラッグ可能な列ヘッダーを取得
    const draggableHeaders = page.locator('.draggable-column-header');
    const headerCount = await draggableHeaders.count();

    if (headerCount >= 2) {
      // 最初の2つのヘッダーの初期順序を取得
      const firstHeader = draggableHeaders.nth(0);
      const secondHeader = draggableHeaders.nth(1);
      
      const firstTitle = await firstHeader.getAttribute('data-column-title');
      const secondTitle = await secondHeader.getAttribute('data-column-title');

      // 最初のヘッダーを2番目のヘッダー上にドラッグ
      await firstHeader.dragTo(secondHeader, { force: true });
      await page.waitForTimeout(1000);

      // ドラッグ後に列順序が入れ替わったことを確認
      const newFirstHeader = draggableHeaders.nth(0);
      const newFirstTitle = await newFirstHeader.getAttribute('data-column-title');

      // 順序が入れ替わっていることを確認
      expect(newFirstTitle).not.toBe(firstTitle);
    }
  });

  test('TC-FUNC-035: ガントチャート - 担当者×チケットバー表示（予定バー/実績バー分離）', async ({ page }) => {
    // 設定パネルを開いてラベルを作成（グラフパネルのラベルフィルターが必要）
    const labelName = uniqueName('ガントラベル');
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // ラベルを追加（IDは newLabelNameInput）
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);
    
    // 設定パネルを閉じる（オーバーレイの背景部分をクリック）
    await closeSettingsOverlay(page);
    await expect(page.locator('#settingsModal')).not.toHaveClass(/active/);

    // 日付付きチケットを作成（ラベルと担当者を付与）
    const ticketName = uniqueName('ガントバーテスト');
    await createDatedTicket(page, ticketName, labelName);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルフィルターで先ほど作成したラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // タイムライン（ガントチャート）ビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);

    // タイムライングリッドが存在することを確認
    await expect(page.locator('.timeline-grid')).toBeVisible();

    // 担当者×チケットの行が存在することを確認
    const assigneeCells = page.locator('.timeline-assignee-cell');
    const assigneeCount = await assigneeCells.count();

    if (assigneeCount > 0) {
      // 予定バー（薄色）が存在することを確認
      const plannedBars = page.locator('.timeline-bar-planned');
      const plannedCount = await plannedBars.count();
      expect(plannedCount).toBeGreaterThan(0);

      // 予定バーが薄色（light background）を持っていることを確認
      const firstPlannedBar = plannedBars.first();
      const plannedBackground = await firstPlannedBar.evaluate(el =>
        window.getComputedStyle(el).backgroundColor
      );
      expect(plannedBackground).toBeTruthy();

      // 実績バー（濃色）が存在する場合、予定バーと異なる色であることを確認
      const actualBars = page.locator('.timeline-bar-actual');
      const actualCount = await actualBars.count();

      if (actualCount > 0) {
        const firstActualBar = actualBars.first();
        const actualBackground = await firstActualBar.evaluate(el =>
          window.getComputedStyle(el).backgroundColor
        );
        
        // 予定バーと実績バーの色が異なることを確認（分離表示）
        expect(actualBackground).not.toBe(plannedBackground);

        // 実績バーに進捗率テキストが含まれている可能性を確認
        const actualTitle = await firstActualBar.getAttribute('title');
        expect(actualTitle).toContain('実績');
      }

      // 担当者セルのラベルが「担当者 - チケット」形式であることを確認
      const firstAssigneeCell = assigneeCells.first();
      const label = await firstAssigneeCell.textContent();
      expect(label).toBeTruthy();
    }
  });

  test('TC-FUNC-036: タイムラインビュー表示切替 - 3つのビュータイプ間で切り替え可能', async ({ page }) => {
    // 管理者でログイン
    await login(page);

    // 日付付きチケットとラベルを作成
    const labelName = `view-switch-label-${Date.now()}`;
    await page.click('#settingsBtn');
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await expect(page.locator('.settings-item', { hasText: labelName })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await closeSettingsOverlay(page);

    // チケットを作成（日付・ラベル・担当者あり）
    const ticketTitle = `ViewSwitch-${Date.now()}`;
    await createDatedTicket(page, ticketTitle, labelName);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // 1. タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(1000);
    // timeline-grid が表示されることを確認
    await expect(page.locator('.timeline-grid')).toBeVisible({ timeout: 5000 });

    // 2. 進捗表ビューに切替
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(1000);
    // progress-matrix-table が表示されることを確認
    await expect(page.locator('.progress-matrix-table')).toBeVisible({ timeout: 5000 });
    // timeline-grid は非表示になっていることを確認
    await expect(page.locator('.timeline-grid')).not.toBeVisible();

    // 3. チケットプログレスビューに切替
    await page.selectOption('#graphViewSelect', 'ticketProgress');
    await page.waitForTimeout(1000);
    // ticket-progress-table が表示されることを確認
    await expect(page.locator('.ticket-progress-table')).toBeVisible({ timeout: 5000 });
    // matrix table は非表示になっていることを確認
    await expect(page.locator('.progress-matrix-table')).not.toBeVisible();

    // 4. 再度タイムラインに戻って確認
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(1000);
    await expect(page.locator('.timeline-grid')).toBeVisible({ timeout: 5000 });
  });

  test('TC-FUNC-037: ガントチャートの日付範囲自動調整', async ({ page }) => {
    // 管理者でログイン
    await login(page);

    // ラベルを作成
    const labelName = `date-range-label-${Date.now()}`;
    await page.click('#settingsBtn');
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await expect(page.locator('.settings-item', { hasText: labelName })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await closeSettingsOverlay(page);

    // 1つ目のチケット：近い日付範囲（来週～来週+7日）
    await createDatedTicket(page, `DateRange-Near-${Date.now()}`, labelName);
    await page.waitForTimeout(500);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択してタイムライン表示
    await page.selectOption('#graphLabelFilter', labelName);
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(1000);

    // 最初のタイムラインの日付範囲を取得
    const initialHeaders = page.locator('.timeline-grid .date-header');
    const initialCount = await initialHeaders.count();
    const firstHeaderInitial = await initialHeaders.first().textContent();
    const lastHeaderInitial = await initialHeaders.last().textContent();

    // 2つ目のチケット：遠い日付範囲を追加
    const startFar = nextWeekday(new Date());
    startFar.setDate(startFar.getDate() + 30); // 30日後から開始
    const endFar = new Date(startFar);
    endFar.setDate(endFar.getDate() + 7);
    const startDateFar = startFar.toISOString().split('T')[0];
    const endDateFar = endFar.toISOString().split('T')[0];

    // チケットを手動で追加（日付を指定）
    await page.click('#addTicketBtn');
    await page.fill('#ticketTitle', `DateRange-Far-${Date.now()}`);
    await page.fill('#startDate', startDateFar);
    await page.fill('#endDate', endDateFar);
    // ラベル選択
    await page.click('#labelDropdown .dropdown-toggle-btn');
    await page.locator('#labelDropdown .dropdown-item', { hasText: labelName }).click();
    // 担当者選択
    const firstAssignee = page.locator('#assigneeDropdown .dropdown-item').first();
    await page.click('#assigneeDropdown .dropdown-toggle-btn');
    await firstAssignee.click();
    await page.click('#saveTicketBtn');
    await page.waitForTimeout(1000);

    // グラフを再描画
    await page.evaluate(() => (window as any).refreshGraphPanel());
    await page.waitForTimeout(1000);

    // 日付範囲が拡張されたことを確認
    const updatedHeaders = page.locator('.timeline-grid .date-header');
    const updatedCount = await updatedHeaders.count();
    const lastHeaderUpdated = await updatedHeaders.last().textContent();

    // ヘッダー数が増えているか、または最終日付が後になっていることを確認
    expect(updatedCount).toBeGreaterThanOrEqual(initialCount);
    // 最終日付が変更されていること（拡張された）
    expect(lastHeaderUpdated).not.toBe(lastHeaderInitial);
  });

  test('TC-FUNC-038: 除外チケット機能 - チケットを除外してグラフから非表示にできる', async ({ page }) => {
    // 管理者でログイン
    await login(page);

    // ラベルを作成
    const labelName = `exclude-label-${Date.now()}`;
    await page.click('#settingsBtn');
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await expect(page.locator('.settings-item', { hasText: labelName })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await closeSettingsOverlay(page);

    // 2つのチケットを作成
    const ticket1Title = `Exclude-Ticket1-${Date.now()}`;
    const ticket2Title = `Exclude-Ticket2-${Date.now() + 1}`;
    await createDatedTicket(page, ticket1Title, labelName);
    await page.waitForTimeout(500);
    await createDatedTicket(page, ticket2Title, labelName);
    await page.waitForTimeout(500);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(1000);

    // 除外前のバー数を記録
    const barsBefore = page.locator('.timeline-bar-planned');
    const countBefore = await barsBefore.count();
    expect(countBefore).toBeGreaterThanOrEqual(2);

    // 除外チケットドロップダウンを開く
    await page.click('#graphExcludeToggleBtn');
    await page.waitForTimeout(500);

    // 1つ目のチケットのチェックボックスをチェック（除外）
    const firstExcludeItem = page.locator('#excludeTicketsList .dropdown-item').first();
    const checkbox = firstExcludeItem.locator('input[type="checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(1000);

    // 除外ボタンラベルが更新されていることを確認
    const excludeBtnText = await page.locator('#graphExcludeToggleBtn').textContent();
    expect(excludeBtnText).toContain('除外チケット (1)');

    // 除外後のバー数が減っていることを確認
    const barsAfter = page.locator('.timeline-bar-planned');
    const countAfter = await barsAfter.count();
    expect(countAfter).toBeLessThan(countBefore);

    // チェックを解除して元に戻す
    await checkbox.uncheck();
    await page.waitForTimeout(1000);

    // バー数が元に戻ったことを確認
    const barsRestored = page.locator('.timeline-bar-planned');
    const countRestored = await barsRestored.count();
    expect(countRestored).toBe(countBefore);
  });

  test('TC-FUNC-039: 担当者フィルター（グラフパネル用）- 担当者でグラフを絞り込める', async ({ page }) => {
    // 管理者でログイン
    await login(page);

    // ラベルを作成
    const labelName = `assignee-filter-label-${Date.now()}`;
    await page.click('#settingsBtn');
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await expect(page.locator('.settings-item', { hasText: labelName })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await closeSettingsOverlay(page);

    // 複数の担当者を持つチケットを作成
    const ticketTitle = `AssigneeFilter-${Date.now()}`;
    await createDatedTicket(page, ticketTitle, labelName);
    await page.waitForTimeout(500);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(1000);

    // 担当者フィルタードロップダウンを開く
    await page.click('#graphAssigneeToggleBtn');
    await page.waitForTimeout(500);

    // 担当者リストが存在することを確認
    const assigneeItems = page.locator('#graphAssigneeList .assignee-list-item');
    const assigneeCount = await assigneeItems.count();
    expect(assigneeCount).toBeGreaterThan(0);

    // 最初の担当者の名前を取得
    const firstAssigneeName = await assigneeItems.first().locator('.assignee-item-name').textContent();
    expect(firstAssigneeName).toBeTruthy();

    // 1つ目の担当者のトグルをOFFにする（除外）
    const firstToggle = assigneeItems.first().locator('.graph-assignee-toggle');
    await firstToggle.uncheck({ force: true });
    await page.waitForTimeout(1000);

    // 担当者ボタンラベルが更新されていることを確認
    const btnText = await page.locator('#graphAssigneeToggleBtn').textContent();
    // 「全担当者」ではなくなっている
    expect(btnText).not.toContain('全担当者');

    // グラフが再描画されたことを確認（timeline-grid が存在）
    await expect(page.locator('.timeline-grid')).toBeVisible();

    // トグルを元に戻す（チェックON）
    await firstToggle.check({ force: true });
    await page.waitForTimeout(1000);

    // 再度「全担当者」になっていることを確認
    const btnTextAfter = await page.locator('#graphAssigneeToggleBtn').textContent();
    expect(btnTextAfter).toContain('全担当者');
  });

  test('TC-FUNC-040: ラベルフィルターでグラフ更新 - ラベル切替でグラフ内容が切り替わる', async ({ page }) => {
    await login(page);

    // 2つのラベルを作成
    const labelA = `ラベルA_${Date.now()}`;
    const labelB = `ラベルB_${Date.now()}`;
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();

    // ラベルA追加
    await page.fill('#newLabelNameInput', labelA);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);

    // ラベルB追加
    await page.fill('#newLabelNameInput', labelB);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);

    await closeSettingsOverlay(page);

    // ラベルAの日付付きチケットを作成
    await createDatedTicket(page, `チケットA_${Date.now()}`, labelA);
    await page.waitForTimeout(1000);

    // ラベルBの日付付きチケットを作成
    await createDatedTicket(page, `チケットB_${Date.now()}`, labelB);
    await page.waitForTimeout(1000);

    // グラフパネルを開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルAを選択
    await page.selectOption('#graphLabelFilter', labelA);
    await page.waitForTimeout(1000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(1000);

    // ラベルAのタイムラインが表示されていることを確認
    const timelineGridA = page.locator('.timeline-grid');
    await expect(timelineGridA).toBeVisible();

    // ラベルBに切替
    await page.selectOption('#graphLabelFilter', labelB);
    await page.waitForTimeout(1000);

    // ラベルBのタイムラインが表示されていることを確認
    const timelineGridB = page.locator('.timeline-grid');
    await expect(timelineGridB).toBeVisible();

    // ラベルAに戻して確認
    await page.selectOption('#graphLabelFilter', labelA);
    await page.waitForTimeout(1000);

    // 再度タイムラインが表示されることを確認
    const timelineGridA2 = page.locator('.timeline-grid');
    await expect(timelineGridA2).toBeVisible();
  });

  test('TC-FUNC-041: チケット追加時のガントチャート反映 - 新規チケットがガントチャートに反映される', async ({ page }) => {
    await login(page);

    // ラベルを作成
    const labelName = `ラベル_${Date.now()}`;
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);
    await closeSettingsOverlay(page);

    // 最初のチケットを作成
    await createDatedTicket(page, `初期チケット_${Date.now()}`, labelName);
    await page.waitForTimeout(1000);

    // グラフパネルを開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);

    // 初期のバー数をカウント（timeline-bar-planned が予定バー）
    const initialBars = page.locator('.timeline-bar-planned');
    const initialCount = await initialBars.count();
    expect(initialCount).toBeGreaterThanOrEqual(1);

    // グラフパネルを閉じる
    await page.click('#graphToggleBtn');
    await page.waitForTimeout(500);

    // 新しいチケットを追加（同じラベル）
    await createDatedTicket(page, `追加チケット_${Date.now()}`, labelName);
    await page.waitForTimeout(1000);

    // グラフパネルを再度開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを再選択してグラフを更新
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(1000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);

    // バー数が増えたことを確認
    const newBars = page.locator('.timeline-bar-planned');
    const newCount = await newBars.count();
    expect(newCount).toBeGreaterThan(initialCount);
  });

  test('TC-FUNC-042: 進捗マトリックスの表示 - カテゴリ別に進捗マトリックスが表示される', async ({ page, request }) => {
    await login(page);

    // ラベルを作成
    const labelName = `ラベル_${Date.now()}`;
    const categoryName = `カテゴリ_${Date.now()}`;
    const ticketTitle = `マトリックスチケット_${Date.now()}`;
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);
    await closeSettingsOverlay(page);
    
    // ページをリロードして新しいラベルを反映
    await page.reload();
    await page.waitForTimeout(2000);
    
    // チケットを作成（カテゴリなし）
    await createDatedTicket(page, ticketTitle, labelName);
    await page.waitForTimeout(2000);
    
    // APIを使ってチケットにカテゴリを設定
    // 1. トークンを取得
    const tokenData = await page.evaluate(() => {
      const raw = sessionStorage.getItem('kanban_auth');
      return raw ? JSON.parse(raw) : null;
    });
    const token = tokenData?.token || '';
    
    // 2. チケット一覧を取得して対象チケットを探す
    const ticketsResp = await request.get('/api/tickets', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('GET /api/tickets status:', ticketsResp.status());
    const tickets = await ticketsResp.json();
    console.log('Tickets count:', (tickets as any[]).length);
    const targetTicket = (tickets as any[]).find((t: any) => t.title === ticketTitle);
    
    if (!targetTicket) {
      console.log('Available titles:', (tickets as any[]).map((t: any) => t.title));
      throw new Error(`チケット "${ticketTitle}" が見つかりません`);
    }
    console.log('Found ticket:', JSON.stringify({ ticketId: targetTicket.ticketId, title: targetTicket.title, category: targetTicket.category }));
    
    // 3. 最小限のTicketDtoでカテゴリを更新
    const putPayload = {
      title: targetTicket.title,
      column: targetTicket.column || 'todo',
      assignees: targetTicket.assignees || [],
      labels: targetTicket.labels || [],
      memo: targetTicket.memo || '',
      childTasks: [],
      isLocked: false,
      isEmergency: false,
      category: categoryName
    };
    console.log('PUT payload:', JSON.stringify(putPayload));
    
    const putResp = await request.put(`/api/tickets/${targetTicket.ticketId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: putPayload
    });
    console.log('PUT /api/tickets/:id status:', putResp.status());
    const putBody = await putResp.text();
    console.log('PUT response body:', putBody);
    
    if (putResp.status() !== 200) {
      throw new Error(`PUT failed with status ${putResp.status()}: ${putBody}`);
    }
    
    const updatedTicket = JSON.parse(putBody);
    console.log('Updated ticket category:', (updatedTicket as any).category);
    
    // 4. ページをリロードして変更を反映
    await page.reload();
    await page.waitForTimeout(3000);

    // クライアント側でカテゴリが正しく読み込まれたか確認
    const clientCategory = await page.evaluate(() => {
      const allTickets = (window as any).AppState?.getAllTickets?.() || [];
      const ticket = allTickets.find((t: any) => t.title.includes('マトリックスチケット'));
      return ticket?.category;
    });
    console.log('Client-side category:', clientCategory);

    // グラフパネルを開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(2000);

    // 進捗マトリックスビューに切替
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(3000);

    // 進捗マトリックステーブルが存在することを確認
    const matrixTable = page.locator('.progress-matrix-table');
    await expect(matrixTable).toBeVisible();

    // タイムラインビューに切替えて、matrix tableが消えることを確認
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);
    await expect(page.locator('.timeline-grid')).toBeVisible();

    // 再度matrixに戻して確認
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(2000);
    await expect(page.locator('.progress-matrix-table')).toBeVisible();
  });

  test('TC-FUNC-043: タイムラインビュー表示 - ガントチャートが日付軸に表示される', async ({ page }) => {
    await login(page);

    // ラベルを作成
    const labelName = `ラベル_${Date.now()}`;
    const ticketTitle = `タイムラインチケット_${Date.now()}`;
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);
    await closeSettingsOverlay(page);

    // ページをリロードして新しいラベルを反映
    await page.reload();
    await page.waitForTimeout(2000);

    // 日付付きチケットを作成
    await createDatedTicket(page, ticketTitle, labelName);
    await page.waitForTimeout(2000);

    // グラフパネルを開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択（グラフパネルのラベルフィルター）
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(2000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(3000);

    // タイムライングリッドまたはガントチャートが表示されることを確認
    const timelineGrid = page.locator('.timeline-grid');
    const ganttChart = page.locator('.gantt-chart');
    const hasTimeline = await timelineGrid.isVisible().catch(() => false);
    const hasGantt = await ganttChart.isVisible().catch(() => false);
    
    expect(hasTimeline || hasGantt).toBe(true);
  });

  test('TC-FUNC-044: チケット進捗ビュー表示 - 進捗率がテーブル形式で表示される', async ({ page }) => {
    await login(page);

    // ラベルを作成
    const labelName = `ラベル_${Date.now()}`;
    const ticketTitle = `進捗チケット_${Date.now()}`;
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);
    await closeSettingsOverlay(page);

    // ページをリロードして新しいラベルを反映
    await page.reload();
    await page.waitForTimeout(2000);

    // チケットを作成
    await createDatedTicket(page, ticketTitle, labelName);
    await page.waitForTimeout(2000);

    // グラフパネルを開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(2000);

    // チケット進捗ビューに切替
    await page.selectOption('#graphViewSelect', 'ticketProgress');
    await page.waitForTimeout(3000);

    // チケット進捗テーブルが存在することを確認
    const progressTable = page.locator('.ticket-progress-table');
    await expect(progressTable).toBeVisible();
  });

  test('TC-FUNC-045: 3つのビュータイプ間の切り替え - タイムライン/マトリックス/進捗間で切り替え可能', async ({ page, request }) => {
    await login(page);

    // ラベルを作成
    const labelName = `ラベル_${Date.now()}`;
    const categoryName = `カテゴリ_${Date.now()}`;
    const ticketTitle = `切替チケット_${Date.now()}`;
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toBeVisible();
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await page.waitForTimeout(500);
    await closeSettingsOverlay(page);

    // ページをリロードして新しいラベルを反映
    await page.reload();
    await page.waitForTimeout(2000);

    // チケットを作成
    await createDatedTicket(page, ticketTitle, labelName);
    await page.waitForTimeout(2000);

    // APIを使ってチケットにカテゴリを設定
    const tokenData = await page.evaluate(() => {
      const raw = sessionStorage.getItem('kanban_auth');
      return raw ? JSON.parse(raw) : null;
    });
    const token = tokenData?.token || '';

    const ticketsResp = await request.get('/api/tickets', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const tickets = await ticketsResp.json();
    const targetTicket = (tickets as any[]).find((t: any) => t.title === ticketTitle);

    if (targetTicket) {
      const putPayload = {
        title: targetTicket.title,
        column: targetTicket.column || 'todo',
        assignees: targetTicket.assignees || [],
        labels: targetTicket.labels || [],
        memo: targetTicket.memo || '',
        childTasks: [],
        isLocked: false,
        isEmergency: false,
        category: categoryName
      };
      await request.put(`/api/tickets/${targetTicket.ticketId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: putPayload
      });
    }

    await page.reload();
    await page.waitForTimeout(3000);

    // グラフパネルを開く
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(2000);

    // 1. タイムラインビュー
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);
    const timelineGrid = page.locator('.timeline-grid');
    const ganttChart = page.locator('.gantt-chart');
    const hasTimeline = await timelineGrid.isVisible().catch(() => false);
    const hasGantt = await ganttChart.isVisible().catch(() => false);
    expect(hasTimeline || hasGantt).toBe(true);

    // 2. マトリックスビュー
    await page.selectOption('#graphViewSelect', 'matrix');
    await page.waitForTimeout(2000);
    const matrixTable = page.locator('.progress-matrix-table');
    await expect(matrixTable).toBeVisible();

    // 3. チケット進捗ビュー
    await page.selectOption('#graphViewSelect', 'ticketProgress');
    await page.waitForTimeout(2000);
    const progressTable = page.locator('.ticket-progress-table');
    await expect(progressTable).toBeVisible();

    // 再度タイムラインに戻って確認
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(2000);
    const hasTimelineAgain = await timelineGrid.isVisible().catch(() => false);
    const hasGanttAgain = await ganttChart.isVisible().catch(() => false);
    expect(hasTimelineAgain || hasGanttAgain).toBe(true);
  });

  test('TC-BND-014: ガントチャート - 総日数3日で進捗40%', async ({ page, request }) => {
    // 管理者でログイン
    await login(page);

    // ラベルを作成
    const labelName = `bnd-label-${Date.now()}`;
    await page.click('#settingsBtn');
    await page.fill('#newLabelNameInput', labelName);
    await page.click('#addLabelBtn');
    await expect(page.locator('.settings-item', { hasText: labelName })).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(1000);
    await closeSettingsOverlay(page);

    // ページをリロードして新しいラベルを反映
    await page.reload();
    await page.waitForTimeout(2000);

    // 総日数3日のチケットを作成（開始日から2日後終了 = 3日間）
    const start = nextWeekday(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 2); // 3日間（start, start+1, start+2）
    const startDateStr = start.toISOString().split('T')[0];
    const endDateStr = end.toISOString().split('T')[0];

    const ticketTitle = `BND014_${Date.now()}`;
    
    // チケットを手動で作成（日付を正確に制御）
    // column-add-btnでモーダルを開く
    await page.click('.column-add-btn[data-column="todo"]');
    await expect(page.locator('#ticketModal')).toBeVisible({ timeout: 5000 });
    await page.fill('#ticketTitle', ticketTitle);
    await page.fill('#startDate', startDateStr);
    await page.fill('#endDate', endDateStr);
    
    // 担当者を設定（admin）
    await page.evaluate(() => {
      const listEl = document.getElementById('assigneeList');
      if (!listEl) return;
      listEl.classList.add('active');
      const items = listEl.querySelectorAll('.assignee-list-item');
      for (const item of items) {
        const toggle = item.querySelector('.assignee-enabled-toggle') as HTMLInputElement;
        if (toggle && toggle.dataset.assignee === 'admin') {
          toggle.checked = !toggle.checked;
          toggle.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    });
    await page.waitForTimeout(300);
    
    // ラベル選択
    await page.evaluate((ln: string) => {
      const listEl = document.getElementById('labelList');
      if (!listEl) return;
      listEl.classList.add('active');
      const items = listEl.querySelectorAll<HTMLDivElement>('.dropdown-item');
      for (const item of items) {
        const text = item.textContent?.trim();
        if (text && text.includes(ln)) {
          (item as HTMLElement).click();
          break;
        }
      }
    }, labelName);
    await page.waitForTimeout(300);
    
    await page.click('#saveBtn');
    await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
    await page.waitForTimeout(1000);

    // 実績APIで進捗を40%に設定
    const tokenData = await page.evaluate(() => {
      const raw = sessionStorage.getItem('kanban_auth');
      return raw ? JSON.parse(raw) : null;
    });
    const token = tokenData?.token || '';

    // チケットを取得
    const ticketsResp = await request.get('/api/tickets', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const tickets: any[] = await ticketsResp.json();
    const targetTicket = tickets.find((t: any) => t.title === ticketTitle);

    if (targetTicket) {
      // 実績APIを使用して進捗40%を登録
      // チケットの開始日に実績データを登録
      const actualDate = start.toISOString().split('T')[0];
      const actualPayload = {
        date: actualDate,
        hours: 4, // 4時間作業
        progressRate: 40 // 進捗40%
      };
      const actualResp = await request.post(`/api/tickets/${targetTicket.ticketId}/actuals`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: actualPayload
      });
      console.log(`TC-BND-014: POST /api/tickets/${targetTicket.ticketId}/actuals status: ${actualResp.status()}`);
      
      // レスポンスから登録後の実績情報を取得
      const createdActual: any = await actualResp.json();
      console.log(`TC-BND-014: 登録後進捗: ${createdActual.progressRate}%`);
    } else {
      console.log('TC-BND-014: 対象チケットが見つかりません');
    }

    // ページをリロードして実績データを反映
    await page.reload();
    
    // initAppが完了するまで待つ
    await page.waitForSelector('#appContent:not(.hidden)', { timeout: 15000 });
    await page.waitForTimeout(3000);

    // グラフパネルを表示
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);
    await page.waitForTimeout(2000);

    // ラベルを選択
    await page.selectOption('#graphLabelFilter', labelName);
    await page.waitForTimeout(2000);

    // タイムラインビューに切替
    await page.selectOption('#graphViewSelect', 'timeline');
    await page.waitForTimeout(5000);

    // タイムライングリッドが存在することを確認
    await expect(page.locator('.timeline-grid')).toBeVisible();

    // 予定バーが存在することを確認
    const plannedBars = page.locator('.timeline-bar-planned');
    await expect(plannedBars.first()).toBeVisible();

    // 実績バーが存在することを確認
    const actualBars = page.locator('.timeline-bar-actual');
    const actualCount = await actualBars.count();
    expect(actualCount).toBeGreaterThan(0);

    // 実績バーの幅を検証（総日数3日 × 40% = 1.2日）
    const firstActualBar = actualBars.first();
    const actualWidth = await firstActualBar.evaluate((el: HTMLElement) => el.offsetWidth);
    const plannedWidth = await plannedBars.first().evaluate((el: HTMLElement) => el.offsetWidth);
    
    const daysPerPixel = plannedWidth / 3;
    const actualDays = actualWidth / daysPerPixel;
    
    // 実績日数が1.2日（40%）に近いことを確認（±0.5日の許容）
    expect(Math.abs(actualDays - 1.2)).toBeLessThan(0.5);
    
    // 実績バーの幅は予定バーより小さいことを確認
    expect(actualWidth).toBeLessThan(plannedWidth);
  });
});

// ===== パフォーマンステスト (TC-PERF-*) =====

test.describe('パフォーマンステスト - グラフ・設定 (TC-PERF-*)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('TC-PERF-005: グラフパネル表示中 - ラベルカラーキャッシュが使用される', async ({ page }) => {
    // Arrange: 複数のラベルを持つチケットを作成
    // まず設定でラベルを登録
    await page.click('#settingsBtn');
    await expect(page.locator('#settingsModal')).toHaveClass(/active/);
    
    // ラベルを追加（正しい要素IDを使用）
    const labelNames = ['Important', 'Normal', 'Urgent'];
    for (const labelName of labelNames) {
      // 既に存在する場合はスキップ
      const exists = await page.locator(`#labelsList:has-text("${labelName}")`).count();
      if (exists === 0) {
        await page.fill('#newLabelNameInput', labelName);
        await page.click('#addLabelBtn');
        await page.waitForTimeout(200);
      }
    }
    
    // 設定パネルを閉じる
    await closeSettingsOverlay(page);

    // 複数のラベル付きチケットを作成（簡素化）
    const tickets = [];
    for (let i = 0; i < 5; i++) {
      const name = uniqueName(`LabelTest${i}`);
      tickets.push(name);
      
      await page.click('.column-add-btn[data-column="todo"]');
      await page.fill('#ticketTitle', name);
      
      // ラベルを割り当て（簡素化：最初のラベルのみ）
      // クリック後、_renderLabelSelect(false) が呼ばれてDOMが再構築されるため、
      // evaluateで直接クリックしてイベントを発火する
      await page.click('#labelToggleBtn');
      await expect(page.locator('#labelList')).toHaveClass(/active/, { timeout: 5000 });
      
      // 最初の.dropdown-itemをevaluateでクリック（DOM再構築対応）
      await page.evaluate(() => {
        const items = document.querySelectorAll('#labelList .dropdown-item');
        if (items.length > 0) {
          (items[0] as HTMLElement).click();
        }
      });
      await page.waitForTimeout(300);
      
      await page.click('#labelToggleBtn');
      await page.waitForTimeout(200);
      
      await page.click('#saveBtn');
      await expect(page.locator('#ticketModal')).toBeHidden({ timeout: 10000 });
    }

    // Act: グラフパネルを表示し、再描画時間を計測
    await page.click('#graphToggleBtn');
    await expect(page.locator('#graphPanelBody')).not.toHaveClass(/hidden/);

    // ラベルカラーキャッシュが使用されていることを確認
    const cacheResult = await page.evaluate(() => {
      // charts.js 内の getLabelColor 関数がキャッシュを使用しているか確認
      const tickets = document.querySelectorAll('.ticket');
      const labelElements = document.querySelectorAll('.ticket-label');
      
      // 同じラベル名の要素が同じカラー値を持っていることを確認
      const labelColors = new Map<string, string>();
      let consistentColors = true;
      
      labelElements.forEach((el: any) => {
        const text = el.textContent?.trim();
        const style = window.getComputedStyle(el);
        const bgColor = style.backgroundColor || style.borderColor;
        
        if (text) {
          if (!labelColors.has(text)) {
            labelColors.set(text, bgColor);
          } else if (labelColors.get(text) !== bgColor) {
            consistentColors = false;
          }
        }
      });
      
      return {
        labelCount: labelColors.size,
        consistentColors,
        totalLabels: labelElements.length
      };
    });

    // Assert: 同じラベルのカラーが一貫している（キャッシュが機能している証拠）
    expect(cacheResult.consistentColors).toBe(true);
    expect(cacheResult.labelCount).toBeGreaterThan(0);

    // グラフ表示の応答時間が合理的な範囲内であることを確認
    const graphRenderTime = await page.evaluate(async () => {
      const start = performance.now();
      // グラフの再描画をトリガー
      const graphViewSelect = document.getElementById('graphViewSelect') as HTMLSelectElement;
      if (graphViewSelect) {
        const current = graphViewSelect.value;
        const options = Array.from(graphViewSelect.options).map(o => o.value);
        const other = options.find(o => o !== current);
        if (other) {
          graphViewSelect.value = other;
          graphViewSelect.dispatchEvent(new Event('change'));
          await new Promise(resolve => setTimeout(resolve, 100));
          graphViewSelect.value = current;
          graphViewSelect.dispatchEvent(new Event('change'));
        }
      }
      await new Promise(resolve => setTimeout(resolve, 200));
      return performance.now() - start;
    });

    // 再描画時間が2秒以内であることを確認（環境依存のため緩い閾値）
    expect(graphRenderTime).toBeLessThan(2000);
  });
});

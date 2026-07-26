import { test, expect, BrowserContext, Page } from '@playwright/test';

/**
 * リアルタイム同期テスト (TC-REAL-*)
 * - Playwrightのマルチコンテキスト機能を使用して2ブラウザをシミュレート
 * - SignalRによるリアルタイム同期動作を確認
 * - デバウンスロジック（500msタイマーリセット方式）の動作を確認
 */

// ログインヘルパー
async function login(context: BrowserContext, username: string = 'admin', password: string = 'clsw'): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/');
  await page.fill('#loginUsername', username);
  await page.fill('#loginPassword', password);
  await page.click('#loginBtn');
  await expect(page.locator('#appContent')).not.toHaveClass(/hidden/);
  // SignalR接続確立を待つ
  await page.waitForTimeout(1000);
  return page;
}

// ユニークなチケット名を生成
function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

// ダイアログハンドラーを設定
function setupDialogHandler(page: Page) {
  page.on('dialog', async (dialog: any) => await dialog.accept());
}

test.describe('リアルタイム同期', () => {
  // ===== TC-REAL-001: 2ブラウザで同じプロジェクト表示中 - ブラウザAでチケット作成 =====
  test('TC-REAL-001: 2ブラウザで同じプロジェクト表示中 - ブラウザAでチケット作成', async ({ browser }) => {
    // ブラウザAとブラウザBの独立したコンテキストを作成
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    // 両ブラウザでログイン
    const pageA = await login(contextA);
    const pageB = await login(contextB);
    
    setupDialogHandler(pageA);
    setupDialogHandler(pageB);

    const ticketName = uniqueName('REAL001');

    // ブラウザAでチケットを作成
    await pageA.click('.column-add-btn[data-column="todo"]');
    await expect(pageA.locator('#ticketModal')).toBeVisible();
    await pageA.fill('#ticketTitle', ticketName);
    await pageA.click('#saveBtn');
    await expect(pageA.locator('#ticketModal')).toBeHidden();

    // ブラウザAで即座に作成されたチケットが表示されることを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // ブラウザBでSignalRにより自動反映されることを確認（デバウンス500ms + マージン）
    // SignalR通知受信→デバウンス500ms→loadTickets()→renderAllTickets() の流れ
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // 重複表示がないことを確認（ブラウザBで1件だけ表示される）
    const ticketsB = pageB.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")');
    await expect(ticketsB).toHaveCount(1);

    // クリーンアップ: ブラウザAでチケットを削除
    const ticket = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first();
    await ticket.hover();
    await ticket.locator('.delete-btn').click();
    await pageA.waitForTimeout(500);

    await pageA.close();
    await pageB.close();
    await contextA.close();
    await contextB.close();
  });

  // ===== TC-REAL-002: 2ブラウザで同じプロジェクト表示中 - ブラウザAでドラッグ＆ドロップ =====
  test('TC-REAL-002: 2ブラウザで同じプロジェクト表示中 - ブラウザAでドラッグ＆ドロップ', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await login(contextA);
    const pageB = await login(contextB);
    
    setupDialogHandler(pageA);
    setupDialogHandler(pageB);

    const ticketName = uniqueName('REAL002');

    // ブラウザAでチケットを作成（todoカラム）
    await pageA.click('.column-add-btn[data-column="todo"]');
    await pageA.fill('#ticketTitle', ticketName);
    await pageA.click('#saveBtn');
    await expect(pageA.locator('#ticketModal')).toBeHidden();

    // 両ブラウザでチケットがtodoカラムに表示されることを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // ブラウザAでAPI経由でカラム変更（ドラッグ＆ドロップをシミュレート）
    const ticketId = await pageA.evaluate(async (args: { name: string }) => {
      const { name } = args;
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      const response = await fetch('/api/tickets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      const tickets = Array.isArray(data) ? data : (data.tickets || []);
      const ticket = tickets.find((t: any) => t.title === name);
      return ticket?.ticketId;
    }, { name: ticketName });

    // ブラウザAでPATCH /api/tickets/{id}/column を呼び出してカラム変更
    const columnResult = await pageA.evaluate(async (id: string) => {
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      const response = await fetch(`/api/tickets/${id}/column`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ column: 'doing' }),
      });
      return { ok: response.ok, status: response.status };
    }, ticketId!);
    
    // API呼び出しが成功したことを確認
    expect(columnResult.ok).toBe(true);

    // ブラウザBで500msデバウンス後に位置が更新されることを確認
    await expect(pageB.locator('.column[data-column="doing"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // todoカラムから消えていることを確認
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")'))
      .toBeHidden({ timeout: 15000 });

    // クリーンアップ
    const doingTicket = pageA.locator('.column[data-column="doing"] .ticket:has-text("' + ticketName + '")').first();
    await doingTicket.hover();
    await doingTicket.locator('.delete-btn').click();
    await pageA.waitForTimeout(500);

    await pageA.close();
    await pageB.close();
    await contextA.close();
    await contextB.close();
  });

  // ===== TC-REAL-003: 2ブラウザで同じプロジェクト表示中 - ブラウザAでチケット削除 =====
  test('TC-REAL-003: 2ブラウザで同じプロジェクト表示中 - ブラウザAでチケット削除', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await login(contextA);
    const pageB = await login(contextB);
    
    setupDialogHandler(pageA);
    setupDialogHandler(pageB);

    const ticketName = uniqueName('REAL003');

    // ブラウザAでチケットを作成
    await pageA.click('.column-add-btn[data-column="todo"]');
    await pageA.fill('#ticketTitle', ticketName);
    await pageA.click('#saveBtn');
    await expect(pageA.locator('#ticketModal')).toBeHidden();

    // 両ブラウザでチケットが表示されることを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // ブラウザAでチケットを削除
    const ticket = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first();
    await ticket.hover();
    await ticket.locator('.delete-btn').click();
    
    // 削除ダイアログの確認待ち
    await pageA.waitForTimeout(500);

    // ブラウザAで削除が反映されることを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")'))
      .toBeHidden({ timeout: 15000 });

    // ブラウザBでSignalRにより削除が反映されることを確認（デバウンス500ms + マージン）
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")'))
      .toBeHidden({ timeout: 20000 });

    await pageA.close();
    await pageB.close();
    await contextA.close();
    await contextB.close();
  });

  // ===== TC-REAL-005: 2ブラウザで同じプロジェクト表示中 - ブラウザAでメモ更新 =====
  test('TC-REAL-005: 2ブラウザで同じプロジェクト表示中 - ブラウザAでメモ更新', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await login(contextA);
    const pageB = await login(contextB);

    // ブラウザAでPATCH /api/settings/memo を呼び出してメモを更新
    const memoValue = `REAL005_${Date.now()}`;
    
    // ブラウザAでメモ更新APIを呼び出し
    await pageA.evaluate(async (memo: string) => {
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      await fetch('/api/settings/memo', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ assignee: 'admin', memo: memo }),
      });
    }, memoValue);

    // ブラウザBで設定を取得してメモが更新されていることを確認
    // PATCH /api/settings/memo はSignalR通知を送信しないため、直接APIで検証
    const memoInB = await pageB.evaluate(async () => {
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const settings = await response.json();
      return settings.memos?.['admin'] || '';
    });

    expect(memoInB).toBe(memoValue);

    // 競合なしで更新されることを確認（既存のメモが上書きされる）
    const memoValue2 = `REAL005_updated_${Date.now()}`;
    await pageA.evaluate(async (memo: string) => {
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      await fetch('/api/settings/memo', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ assignee: 'admin', memo: memo }),
      });
    }, memoValue2);

    const memoInB2 = await pageB.evaluate(async () => {
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      const response = await fetch('/api/settings', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const settings = await response.json();
      return settings.memos?.['admin'] || '';
    });

    expect(memoInB2).toBe(memoValue2);

    await pageA.close();
    await pageB.close();
    await contextA.close();
    await contextB.close();
  });

  // ===== TC-REAL-006: SignalR通知受信時 - 短時間内に複数通知 =====
  test('TC-REAL-006: SignalR通知受信時 - 短時間内に複数通知', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await login(contextA);
    const pageB = await login(contextB);
    
    setupDialogHandler(pageA);
    setupDialogHandler(pageB);

    const ticketNames = [
      uniqueName('REAL006_1'),
      uniqueName('REAL006_2'),
      uniqueName('REAL006_3'),
    ];

    // ブラウザAで短時間内に複数のチケットを連続作成
    for (const name of ticketNames) {
      await pageA.click('.column-add-btn[data-column="todo"]');
      await pageA.fill('#ticketTitle', name);
      await pageA.click('#saveBtn');
      await expect(pageA.locator('#ticketModal')).toBeHidden();
      // 各作成間で短い待機（SignalR通知がバッチ処理されるように）
      await pageA.waitForTimeout(100);
    }

    // ブラウザBで500msデバウンス後に最終状態のみが適用されることを確認
    // 全チケットが表示されることを確認
    for (const name of ticketNames) {
      await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first())
        .toBeVisible({ timeout: 20000 });
    }

    // 重複描画がないことを確認（各チケットが1件だけ表示される）
    for (const name of ticketNames) {
      const tickets = pageB.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")');
      await expect(tickets).toHaveCount(1);
    }

    // クリーンアップ
    for (const name of ticketNames) {
      const ticket = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + name + '")').first();
      if (await ticket.isVisible()) {
        await ticket.hover();
        await ticket.locator('.delete-btn').click();
        await pageA.waitForTimeout(300);
      }
    }

    await pageA.close();
    await pageB.close();
    await contextA.close();
    await contextB.close();
  });

  // ===== TC-REAL-008: 自分自身での更新 - チケット更新API呼び出し =====
  test('TC-REAL-008: 自分自身での更新 - チケット更新API呼び出し', async ({ browser }) => {
    const contextA = await browser.newContext();

    const pageA = await login(contextA);
    setupDialogHandler(pageA);

    const ticketName = uniqueName('REAL008');
    const updatedName = uniqueName('REAL008_updated');

    // ブラウザAでチケットを作成
    await pageA.click('.column-add-btn[data-column="todo"]');
    await pageA.fill('#ticketTitle', ticketName);
    await pageA.click('#saveBtn');
    await expect(pageA.locator('#ticketModal')).toBeHidden();

    // 作成したチケットが表示されることを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // ブラウザAでチケットを編集して保存（API経由で更新）
    const ticket = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")').first();
    await ticket.click();
    await expect(pageA.locator('#ticketModal')).toBeVisible();
    await pageA.fill('#ticketTitle', updatedName);
    await pageA.click('#saveBtn');
    await expect(pageA.locator('#ticketModal')).toBeHidden();

    // 自身での更新後、二重通知がないことを確認（チケットが1件だけ表示される）
    const updatedTickets = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + updatedName + '")');
    await expect(updatedTickets).toHaveCount(1, { timeout: 15000 });

    // 旧名では表示されないことを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + ticketName + '")'))
      .toBeHidden({ timeout: 15000 });

    // クリーンアップ
    const updatedTicket = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + updatedName + '")').first();
    await updatedTicket.hover();
    await updatedTicket.locator('.delete-btn').click();
    await pageA.waitForTimeout(500);

    await pageA.close();
    await contextA.close();
  });

  // ===== TC-REAL-010: チケットコピー時 - コピー操作実行 =====
  test('TC-REAL-010: チケットコピー時 - コピー操作実行', async ({ browser }) => {
    const contextA = await browser.newContext();
    const contextB = await browser.newContext();

    const pageA = await login(contextA);
    const pageB = await login(contextB);
    
    setupDialogHandler(pageA);
    setupDialogHandler(pageB);

    const originalName = uniqueName('REAL010_original');
    const copyName = uniqueName('REAL010_copy');

    // ブラウザAで元のチケットを作成
    await pageA.click('.column-add-btn[data-column="todo"]');
    await pageA.fill('#ticketTitle', originalName);
    await pageA.click('#saveBtn');
    await expect(pageA.locator('#ticketModal')).toBeHidden();

    // 両ブラウザで元のチケットが表示されることを確認
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + originalName + '")').first())
      .toBeVisible({ timeout: 15000 });
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + originalName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // ブラウザAでコピー操作をシミュレート
    // updateTicket() → createTicket() の連続API呼び出しをシミュレート
    const ticketId = await pageA.evaluate(async (args: { name: string }) => {
      const { name } = args;
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      const response = await fetch('/api/tickets', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      const tickets = Array.isArray(data) ? data : (data.tickets || []);
      const ticket = tickets.find((t: any) => t.title === name);
      return ticket?.ticketId;
    }, { name: originalName });

    // コピー操作: まず元のチケットを更新（updateTicket）、次に新しいチケットを作成（createTicket）
    const copyResult = await pageA.evaluate(async (args: { id: string; copyName: string }) => {
      const { id, copyName } = args;
      const auth = JSON.parse(sessionStorage.getItem('kanban_auth') || '{}');
      const token = auth.token;
      
      // 1. updateTicket() - 元のチケットを更新
      const updateResponse = await fetch(`/api/tickets/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: 'copied', column: 'todo' }),
      });
      
      // 2. createTicket() - 新しいチケットを作成（連続API呼び出し）
      const createResponse = await fetch('/api/tickets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: copyName, column: 'todo' }),
      });
      
      return {
        updateOk: updateResponse.ok,
        updateStatus: updateResponse.status,
        createOk: createResponse.ok,
        createStatus: createResponse.status
      };
    }, { id: ticketId!, copyName });
    
    // API呼び出しが成功したことを確認
    expect(copyResult.updateOk).toBe(true);
    expect(copyResult.createOk).toBe(true);

    // ブラウザAで二重表示がないことを確認
    // 元のチケット（タイトル変更済み）とコピーされたチケットの両方が表示される
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("copied")').first())
      .toBeVisible({ timeout: 15000 });
    await expect(pageA.locator('.column[data-column="todo"] .ticket:has-text("' + copyName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // ブラウザBでも両方のチケットが表示されることを確認
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("copied")').first())
      .toBeVisible({ timeout: 15000 });
    await expect(pageB.locator('.column[data-column="todo"] .ticket:has-text("' + copyName + '")').first())
      .toBeVisible({ timeout: 15000 });

    // 重複表示がないことを確認（各チケットが1件だけ表示される）
    const copiedTickets = pageB.locator('.column[data-column="todo"] .ticket:has-text("copied")');
    await expect(copiedTickets).toHaveCount(1);
    
    const newTickets = pageB.locator('.column[data-column="todo"] .ticket:has-text("' + copyName + '")');
    await expect(newTickets).toHaveCount(1);

    // クリーンアップ
    // "copied" チケットを削除
    const copiedTicket = pageA.locator('.column[data-column="todo"] .ticket:has-text("copied")').first();
    if (await copiedTicket.isVisible()) {
      await copiedTicket.hover();
      await copiedTicket.locator('.delete-btn').click();
      await pageA.waitForTimeout(500);
    }
    
    // コピーチケットを削除
    const newTicket = pageA.locator('.column[data-column="todo"] .ticket:has-text("' + copyName + '")').first();
    if (await newTicket.isVisible()) {
      await newTicket.hover();
      await newTicket.locator('.delete-btn').click();
      await pageA.waitForTimeout(500);
    }

    await pageA.close();
    await pageB.close();
    await contextA.close();
    await contextB.close();
  });
});

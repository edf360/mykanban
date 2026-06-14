/**
 * カンバンボード - メインエントリーポイント
 * 各モジュールを統合して初期化
 */

import { state, setGraphPanelOpen, isGraphPanelOpen, getLabelSuggestions } from './modules/state.js';
import { loadTickets, loadSuggestions } from './modules/api.js';
import { renderAllTickets } from './modules/renderer.js';
import { setupDropZones } from './modules/dragdrop.js';
import { initModal, openNewModal } from './modules/modal.js';
import { renderLabelSelect } from './modules/labels.js';
import { renderAssigneeSelect } from './modules/assignees.js';
import { addChildTask } from './modules/childtasks.js';
import { initHistory } from './modules/history.js';
import { initActual } from './modules/actual.js';
import { populateAssigneeFilter, populateLabelFilter, initFilter, adjustBoardForFilterOnInit } from './modules/filter.js';
import { initArchive } from './modules/archive.js';
import { initMemo, updateMemoColumn } from './modules/memo.js';
import { init as initSettings, load as loadSettings } from './modules/settings.js';
import { getToken, login, logout, showLoginScreen, showAppScreen, getUsername } from './modules/auth.js';
import { logInfo, logError, copyToClipboard, exportAsText, getLogBuffer, onUIUpdate } from './modules/logger.js';
import { renderProgressMatrix, renderTimelineView, getTicketsByLabel } from './modules/charts.js';

// ===== 初期化ガード =====
let appInitialized = false;

// ===== イベントコントローラー（統合削除用） =====
let eventController = null;

// ===== resize debounce タイマー =====
let resizeTimer = null;

/**
 * アプリケーションのメイン初期化処理
 */
async function initApp() {
  if (appInitialized) {
    logError('[app] initApp already called, skipping');
    return;
  }
  appInitialized = true;

  console.log('[app] DOMContentLoaded fired');

  // イベントコントローラー作成
  eventController = new AbortController();
  const { signal } = eventController;

  try {
    // 1. モーダル関連イベント
    logInfo('[app] Initializing modal...');
    initModal();

    // 2. 履歴ダイアログ
    initHistory();

    // 2.5 実績ダイアログ
    initActual();

    // 3. ドラッグ＆ドロップ
    setupDropZones();

    // 4. アーカイブトグル
    initArchive();

    // 5. メモ機能
    initMemo();

    // 5.5 統合ドキュメントクリックハンドラ（AbortController使用）
    document.addEventListener('click', (e) => {
      // 担当者ドロップダウン
      const assigneeDropdown = document.getElementById('assigneeDropdown');
      if (assigneeDropdown && !assigneeDropdown.contains(e.target)) {
        const assigneeList = document.getElementById('assigneeList');
        if (assigneeList) assigneeList.classList.remove('active');
      }
      // ラベルドロップダウン
      const labelDropdown = document.getElementById('labelDropdown');
      if (labelDropdown && !labelDropdown.contains(e.target)) {
        const labelList = document.getElementById('labelList');
        if (labelList) labelList.classList.remove('active');
      }
      // 除外チケットドロップダウン
      const excludeTicketsList = document.getElementById('excludeTicketsList');
      const excludeToggleBtn = document.getElementById('graphExcludeToggleBtn');
      if (excludeTicketsList && excludeToggleBtn && !excludeToggleBtn.contains(e.target) && !excludeTicketsList.contains(e.target)) {
        excludeTicketsList.classList.remove('active');
      }
    }, { signal });

    // 6. 設定パネル
    initSettings();

    // 6.5 カラムヘッダーの追加ボタン（todo/doing/done）
    document.querySelectorAll('.column-add-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const column = btn.dataset.column;
        openNewModal(column);
      });
    });

    // 7. 子タスク追加ボタン
    const addChildTaskBtn = document.getElementById('addChildTaskBtn');
    if (addChildTaskBtn) {
      addChildTaskBtn.addEventListener('click', () => {
        addChildTask('', false);
      });
    } else {
      logError('[app] addChildTaskBtn not found in DOM');
    }

    // 8. ログアウトボタン
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.classList.remove('hidden');
      logoutBtn.addEventListener('click', async () => {
        if (!confirm('ログアウトしますか？')) return;
        try {
          await logout();
          location.reload();
        } catch (err) {
          logError('ログアウト失敗: ' + err.message);
        }
      });
    }

    // 9. サーバーからデータをロード
    logInfo('[app] Starting data initialization...');
    console.log('[app] state address:', state, 'id:', state.ticketCounter);

    // 設定データを先に読み込み（ラベル色情報用）
    await loadSettings();
    logInfo('[app] loadSettings done');

    // チケットとサジェストは並列化
    await Promise.all([loadTickets(), loadSuggestions()]);
    logInfo('[app] loadTickets done, tickets: ' + state.allTickets.length);
    logInfo('[app] loadSuggestions done, assigneeSuggestions: ' + JSON.stringify(state.assigneeSuggestions));

    // フィルターをpopulate
    populateAssigneeFilter();
    populateLabelFilter();

    // ログインユーザーのチケットをデフォルトで表示
    const username = getUsername();
    if (username) {
      const assigneeSelect = document.getElementById('assigneeFilterSelect');
      if (assigneeSelect) {
        assigneeSelect.value = username;
        logInfo('[app] Default assignee filter set to: ' + username);
      }
    }

    // チケットを描画
    renderAllTickets();

    // 初期状態でメモカラムを更新
    updateMemoColumn();

    // フィルターを一元初期化（担当者・検索・メイン担当・トグル）
    initFilter();

    // 10. ログパネル初期化（DOM準備後）
    initLogsPanelInternal();

    // 11. グラフパネル初期化（DOM準備後）
    initGraphPanelInternal();

    // アプリ画面を表示
    showAppScreen();
    
    // アプリ表示後にフィルター調整（フィルター高さが正しく取得できるように）
    adjustBoardForFilterOnInit();
    
    logInfo('[app] Initialization complete');
  } catch (error) {
    logError('Failed to initialize application: ' + error.message);
    console.error('Failed to initialize application:', error);
  }
}

/**
 * ログインフォームのセットアップ
 */
function setupLoginForm() {
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');

  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('loginUsername')?.value?.trim();
    const password = document.getElementById('loginPassword')?.value;

    if (!username || !password) {
      if (loginError) {
        loginError.textContent = 'ユーザ名とパスワードを入力してください';
        loginError.classList.remove('hidden');
      }
      return;
    }

    try {
      await login(username, password);
      await initApp();
    } catch (error) {
      if (loginError) {
        loginError.textContent = error.message || 'ログインに失敗しました';
        loginError.classList.remove('hidden');
      }
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const token = getToken();
  if (token) {
    await initApp();
  } else {
    showLoginScreen();
    setupLoginForm();
  }
});

// ===== ログパネル関連 =====

/**
 * ログエントリをDOMに描画
 */
function renderLogEntries() {
  const logsList = document.getElementById('logsList');
  const levelFilter = document.getElementById('logsLevelFilter');
  const searchInput = document.getElementById('logsSearchInput');
  const logsCount = document.getElementById('logsCount');
  if (!logsList) return;

  const filterLevel = levelFilter?.value || 'DEBUG';
  const searchText = searchInput?.value?.toLowerCase() || '';

  const levelOrder = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 };
  const minLevel = levelOrder[filterLevel] ?? 0;

  const entries = getLogBuffer().filter(entry => {
    if ((levelOrder[entry.level] ?? 0) < minLevel) return false;
    if (searchText) {
      const msg = (entry.message || '').toLowerCase();
      if (!msg.includes(searchText)) return false;
    }
    return true;
  });

  logsList.innerHTML = '';

  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.setAttribute('data-level', entry.level);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'log-entry-time';
    const d = new Date(entry.timestamp);
    timeSpan.textContent = d.toLocaleTimeString('ja-JP', { hour12: false });

    const levelSpan = document.createElement('span');
    levelSpan.className = 'log-entry-level';
    levelSpan.textContent = `[${entry.level}]`;

    const msgSpan = document.createElement('span');
    msgSpan.className = 'log-entry-message';
    msgSpan.textContent = entry.message;

    div.appendChild(timeSpan);
    div.appendChild(levelSpan);
    div.appendChild(msgSpan);
    fragment.appendChild(div);
  }
  logsList.appendChild(fragment);

  if (logsCount) {
    logsCount.textContent = `${entries.length} 件`;
  }
}

/**
 * ログパネルの初期化（initApp内から呼び出し）
 */
function initLogsPanelInternal() {
  const logsBtn = document.getElementById('logsBtn');
  const logsPanel = document.getElementById('logsPanel');
  const logsCloseBtn = document.getElementById('logsCloseBtn');
  const logsCopyBtn = document.getElementById('logsCopyBtn');
  const logsExportBtn = document.getElementById('logsExportBtn');
  const logsLevelFilter = document.getElementById('logsLevelFilter');
  const logsSearchInput = document.getElementById('logsSearchInput');
  const logsFetchServerBtn = document.getElementById('logsFetchServerBtn');

  if (!logsPanel) {
    logError('[app] logsPanel not found in DOM');
    return;
  }

  // ログボタンクリック → パネル表示
  if (logsBtn) {
    logsBtn.addEventListener('click', () => {
      logsPanel.classList.toggle('active');
      if (logsPanel.classList.contains('active')) {
        renderLogEntries();
      }
    });
  }

  // 閉じるボタン
  if (logsCloseBtn) {
    logsCloseBtn.addEventListener('click', () => {
      logsPanel.classList.remove('active');
    });
  }

  // コピーボタン
  if (logsCopyBtn) {
    logsCopyBtn.addEventListener('click', () => {
      const level = logsLevelFilter?.value || 'DEBUG';
      copyToClipboard(level);
    });
  }

  // エクスポートボタン
  if (logsExportBtn) {
    logsExportBtn.addEventListener('click', () => {
      const level = logsLevelFilter?.value || 'DEBUG';
      const text = exportAsText(level);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kanban-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // レベルフィルタ変更
  if (logsLevelFilter) {
    logsLevelFilter.addEventListener('change', () => {
      renderLogEntries();
    });
  }

  // 検索入力
  if (logsSearchInput) {
    logsSearchInput.addEventListener('input', () => {
      renderLogEntries();
    });
  }

  // サーバーログ取得ボタン
  if (logsFetchServerBtn) {
    logsFetchServerBtn.addEventListener('click', async () => {
      try {
        const token = getToken();
        const options = {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        };
        if (token) {
          options.headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch('/api/logs', options);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const lines = await response.json();
        if (Array.isArray(lines)) {
          for (const line of lines) {
            logInfo('[Server] ' + line);
          }
          renderLogEntries();
        }
      } catch (error) {
        logError('サーバーログ取得失敗: ' + error.message);
      }
    });
  }

  // loggerのUI更新リスナー登録
  onUIUpdate(() => {
    if (logsPanel.classList.contains('active')) {
      renderLogEntries();
    }
  });
}

// ===== グラフパネル関連 =====

/**
 * グラフパネルの初期化（initApp内から呼び出し）
 */
function initGraphPanelInternal() {
  const graphToggleBtn = document.getElementById('graphToggleBtn');
  const graphPanel = document.getElementById('graphPanel');
  const graphPanelBody = document.getElementById('graphPanelBody');
  const graphPanelResizeHandle = document.getElementById('graphPanelResizeHandle');
  const graphLabelSelect = document.getElementById('graphLabelFilter');
  const graphViewSelect = document.getElementById('graphViewSelect');
  const excludeToggleBtn = document.getElementById('graphExcludeToggleBtn');
  const excludeTicketsList = document.getElementById('excludeTicketsList');
  const excludeDropdown = document.getElementById('excludeTicketsDropdown');
  const matrixContainer = document.getElementById('matrixTableContainer');
  const mainContainer = document.querySelector('.main-container');
  const bottomLeftButtons = document.querySelector('.bottom-left-buttons');

  if (!graphPanel) {
    logError('[app] graphPanel not found in DOM');
    return;
  }

  // ラベルリストをドロップダウンに設定
  function populateGraphLabelSelect() {
    if (!graphLabelSelect) return;
    const labels = state.labelSuggestions || [];
    graphLabelSelect.innerHTML = '<option value="">ラベルを選択</option>';
    labels.forEach(label => {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      graphLabelSelect.appendChild(option);
    });
  }

  // 除外チケットの選択状態（IDセット）
  const excludedTicketSet = new Set();

  // 除外チケットリストをドロップダウンに設定
  function populateExcludeTicketsSelect(labelName) {
    if (!excludeTicketsList) return;
    const tickets = getTicketsByLabel(labelName);
    excludeTicketsList.innerHTML = '';
    tickets.forEach(t => {
      const item = document.createElement('div');
      item.className = 'dropdown-item';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = excludedTicketSet.has(t.id);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          excludedTicketSet.add(t.id);
        } else {
          excludedTicketSet.delete(t.id);
        }
        updateGraphPanel();
      });
      const span = document.createElement('span');
      span.textContent = t.title || '無題';
      item.appendChild(cb);
      item.appendChild(span);
      excludeTicketsList.appendChild(item);
    });
    updateExcludeButtonLabel();
  }

  // 除外ボタンラベルを更新
  function updateExcludeButtonLabel() {
    if (!excludeToggleBtn) return;
    const count = excludedTicketSet.size;
    excludeToggleBtn.textContent = count > 0 ? `除外チケット (${count}) ▼` : '除外チケットを選択 ▼';
  }

  // 除外チケットの選択ID一覧を取得
  function getExcludedTicketIds() {
    return Array.from(excludedTicketSet);
  }

  // 選択されたラベルで表を更新
  function updateGraphPanel() {
    if (!graphLabelSelect) return;
    const labelName = graphLabelSelect.value;
    const viewType = graphViewSelect?.value || 'matrix';
    if (!labelName) {
      if (matrixContainer) matrixContainer.innerHTML = '';
      if (excludeTicketsList) excludeTicketsList.innerHTML = '';
      return;
    }
    populateExcludeTicketsSelect(labelName);
    const excludedIds = getExcludedTicketIds();
    if (viewType === 'timeline') {
      renderTimelineView(matrixContainer, labelName, excludedIds);
    } else {
      renderProgressMatrix(matrixContainer, labelName, excludedIds);
    }
  }

  // bottomLeftButtons の bottom とカンバンボードの高さをグラフパネルの高さに合わせて更新
  function updatePanelLayout(panelHeight) {
    if (bottomLeftButtons) {
      bottomLeftButtons.style.bottom = `${panelHeight + 32}px`;
    }
    const kanbanMain = document.querySelector('.kanban-main');
    const kanbanBoard = document.querySelector('.kanban-board');
    const remainingHeight = window.innerHeight - panelHeight;
    if (kanbanMain) {
      kanbanMain.style.height = `${remainingHeight}px`;
    }
    if (kanbanBoard) {
      kanbanBoard.style.height = `${remainingHeight}px`;
    }
  }

  // ブラウザサイズ変更・ズーム時にレイアウトを再計算
  const handleBrowserResize = () => {
    if (!state.graphPanelOpen) return;
    const panelHeight = graphPanel.offsetHeight;
    updatePanelLayout(panelHeight);
    if (graphLabelSelect && graphLabelSelect.value) {
      const excludedIds = getExcludedTicketIds();
      // 現在のビュータイプに応じて適切な関数を呼び出す
      if (graphViewSelect && graphViewSelect.value === 'timeline') {
        renderTimelineView(matrixContainer, graphLabelSelect.value, excludedIds);
      } else {
        renderProgressMatrix(matrixContainer, graphLabelSelect.value, excludedIds);
      }
    }
  };

  // debounce付きresizeイベント
  const handleBrowserResizeDebounced = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleBrowserResize, 100);
  };
  window.addEventListener('resize', handleBrowserResizeDebounced);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleBrowserResizeDebounced);
  }

  // グラフトグルボタン
  if (graphToggleBtn) {
    graphToggleBtn.addEventListener('click', () => {
      const isOpen = !isGraphPanelOpen();
      setGraphPanelOpen(isOpen);
      
      if (isOpen) {
        // パネル表示
        graphPanel.classList.remove('hidden');
        graphPanel.style.display = 'flex';
        if (graphPanelBody) {
          graphPanelBody.classList.remove('hidden');
          graphPanelBody.style.display = 'block';
        }
        if (mainContainer) mainContainer.classList.add('graph-panel-open');
        if (bottomLeftButtons) {
          bottomLeftButtons.classList.add('graph-panel-open');
        }
        const kanbanMain = document.querySelector('.kanban-main');
        const kanbanBoard = document.querySelector('.kanban-board');
        const panelHeight = graphPanel.offsetHeight;
        const remainingHeight = window.innerHeight - panelHeight;
        if (kanbanMain) {
          kanbanMain.style.height = `${remainingHeight}px`;
        }
        if (kanbanBoard) {
          kanbanBoard.style.height = `${remainingHeight}px`;
        }
        if (bottomLeftButtons) {
          bottomLeftButtons.style.bottom = `${panelHeight + 32}px`;
        }
        populateGraphLabelSelect();
        const labels = getLabelSuggestions();
        if (graphLabelSelect && labels && labels.length > 0) {
          graphLabelSelect.value = labels[0];
          updateGraphPanel();
        }
      } else {
        // パネル非表示
        graphPanel.classList.add('hidden');
        graphPanel.style.display = 'none';
        if (graphPanelBody) {
          graphPanelBody.classList.add('hidden');
          graphPanelBody.style.display = 'none';
        }
        if (mainContainer) mainContainer.classList.remove('graph-panel-open');
        if (bottomLeftButtons) {
          bottomLeftButtons.classList.remove('graph-panel-open');
          bottomLeftButtons.style.bottom = '';
        }
        const kanbanMain = document.querySelector('.kanban-main');
        const kanbanBoard = document.querySelector('.kanban-board');
        if (kanbanMain) {
          kanbanMain.style.height = '';
        }
        if (kanbanBoard) {
          kanbanBoard.style.height = '';
        }
        graphPanel.style.height = '20vh';
      }
    });
  }

  // ラベル変更イベント
  if (graphLabelSelect) {
    graphLabelSelect.addEventListener('change', () => {
      updateGraphPanel();
    });
  }

  // ビュー切替イベント
  if (graphViewSelect) {
    graphViewSelect.addEventListener('change', () => {
      updateGraphPanel();
    });
  }

  // 除外チケットドロップダウントグル
  if (excludeToggleBtn && excludeTicketsList) {
    excludeToggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      excludeTicketsList.classList.toggle('active');
    });
    excludeTicketsList.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  if (excludeDropdown) {
    excludeDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  // リサイズハンドルによる高さ変更
  if (graphPanelResizeHandle) {
    let isResizing = false;
    let startY = 0;
    let startHeight = 0;
    const minHeight = 150;
    const maxHeight = window.innerHeight - 100;

    graphPanelResizeHandle.addEventListener('mousedown', (e) => {
      if (!state.graphPanelOpen) return;
      isResizing = true;
      startY = e.clientY;
      startHeight = graphPanel.offsetHeight;
      graphPanelResizeHandle.classList.add('dragging');
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const deltaY = startY - e.clientY;
      let newHeight = startHeight + deltaY;
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));
      graphPanel.style.height = `${newHeight}px`;
      updatePanelLayout(newHeight);
      if (graphLabelSelect && graphLabelSelect.value) {
        updateGraphPanel();
      }
    });

    document.addEventListener('mouseup', () => {
      if (!isResizing) return;
      isResizing = false;
      graphPanelResizeHandle.classList.remove('dragging');
    });
  }
}

/**
 * カンバンボード - メインエントリーポイント
 * 各モジュールを統合して初期化
 */

import { state, setGraphPanelOpen, isGraphPanelOpen, getLabelSuggestions, restoreHiddenChildTasks, setCloseGraphPanelCallback, on, emit, invalidateLabelColorCache } from './modules/state.js';
import { loadUserSettings, saveUserSettings } from './modules/userSettings.js';
import { loadTickets, loadSuggestions } from './modules/api.js';
import { renderAllTickets } from './modules/renderer.js';
import { setupDropZones } from './modules/dragdrop.js';
import { initModal, openNewModal, openEditModal } from './modules/modal.js';
import { renderLabelSelect } from './modules/labels.js';
import { renderAssigneeSelect, renderGraphAssigneeSelect } from './modules/assignees.js';
import { addChildTask } from './modules/childtasks.js';
import { initActualTable, saveActualState } from './modules/actualTable.js';
import { populateAssigneeFilter, populateLabelFilter, initFilter, adjustBoardForFilterOnInit } from './modules/filter.js';
import { initArchive } from './modules/archive.js';
import { initMemo, updateMemoColumn } from './modules/memo.js';
import { init as initSettings, load as loadSettings } from './modules/settings.js';
import { getToken, login, logout, showLoginScreen, showAppScreen, getUsername, isAdmin } from './modules/auth.js';
import { logInfo, logError, copyToClipboard, exportAsText, getLogBuffer, onUIUpdate } from './modules/logger.js';
import { renderProgressMatrix, renderTimelineView, renderTicketProgress, getTicketsByLabel } from './modules/charts.js';

// ===== 初期化ガード（= new Set(['initialized']);にするとログインできなくなる =====
const initGuard = new Set();

// ===== イベントコントローラー（統合削除用） =====
let eventController = null;

// ===== resize debounce タイマー =====
let resizeTimer = null;

/**
 * アプリケーションのメイン初期化処理
 */
async function initApp() {
  console.log('initApp start');

  if (initGuard.has('initialized')) {
    console.log('already initialized');
    logError('[app] initApp already called, skipping');
    return;
  }

  initGuard.add('initialized');

  console.log('after guard');

  // イベントコントローラー作成
  eventController = new AbortController();
  const { signal } = eventController;

  try {
    // イベントバスリスナー登録（循環依存解消用）
    on('open-edit-modal', (data) => {
        openEditModal(data.ticketId);
    });
    on('render-tickets', () => {
        renderAllTickets();
    });
    on('settings-saved', () => {
        invalidateLabelColorCache();
        renderAllTickets();
    });

    // 1. モーダル関連イベント
    logInfo('[app] Initializing modal...');
    initModal();

    // 2. ドラッグ＆ドロップ
    setupDropZones();

    // 4. アーカイブトグル
    initArchive();

    // 5. メモ機能
    initMemo();

    // 5.5 統合ドキュメントクリックハンドラ（AbortController使用）
    document.addEventListener('click', (e) => {
      // カラム追加ボタン（イベントデリゲーション）
      const addBtn = e.target.closest('.column-add-btn');
      if (addBtn) {
        e.stopPropagation();
        openNewModal(addBtn.dataset.column);
        return;
      }

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

    // 7. 子タスク追加ボタン
    const addChildTaskBtn = document.getElementById('addChildTaskBtn');
    if (addChildTaskBtn) {
      addChildTaskBtn.addEventListener('click', () => {
        addChildTask('', false);
        // 新しく作成された子タスクのinputにフォーカス
        setTimeout(() => {
          const childTasksEl = document.getElementById('childTasks');
          if (childTasksEl) {
            const inputs = childTasksEl.querySelectorAll('input.child-task-name');
            if (inputs.length > 0) {
              const lastInput = inputs[inputs.length - 1];
              lastInput.focus();
            }
          }
        }, 50);
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
          stopSignalRConnection();
          await logout();
          location.reload();
        } catch (err) {
          logError('ログアウト失敗: ' + err.message);
        }
      });
    }

    // 9. 子タスク非表示状態を復元
    restoreHiddenChildTasks();

    // 10. サーバーからデータをロード
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

    // ログインユーザーのチケットをデフォルトで表示（管理者は「すべて」選択）
    const username = getUsername();
    if (username) {
      const assigneeSelect = document.getElementById('assigneeFilterSelect');
      if (assigneeSelect) {
        if (isAdmin()) {
          assigneeSelect.value = '';
          logInfo('[app] Admin logged in, assignee filter set to all');
        } else {
          assigneeSelect.value = username;
          logInfo('[app] Default assignee filter set to: ' + username);
        }
      }
    }

    // チケットを描画
    renderAllTickets();

    // フィルターを一元初期化（担当者・検索・メイン担当・トグル）
    initFilter();

    // メモカラムを初期化（表示/非表示復元・イベント設定）
    initMemo();

    // 初期状態でメモカラムの内容を更新
    updateMemoColumn();

    // 12. ログパネル初期化（DOM準備後）
    initLogsPanelInternal();

    // 13. グラフパネル初期化（DOM準備後）
    initGraphPanelInternal();
    
    // 14. 実績入力パネル初期化
    initActualTablePanel();

    // アプリ画面を表示
    showAppScreen();
    
    // アプリ表示後にフィルター調整（フィルター高さが正しく取得できるように）
    adjustBoardForFilterOnInit();
    
    // SignalR 接続を開始
    startSignalRConnection();
    
    logInfo('[app] Initialization complete');
  } catch (error) {
    console.error('INIT ERROR', error);
    alert(
      error?.stack ||
      error?.message ||
      String(error)
    );
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
      logsBtn.classList.toggle('active');
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

  // 担当者リストをカスタムドロップダウンに設定
  function populateGraphAssigneeFilter() {
    renderGraphAssigneeSelect();
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
        saveGraphSettings();
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
    const assigneeFilter = state.graphAssignees || [];
    if (!labelName) {
      if (matrixContainer) matrixContainer.innerHTML = '';
      if (excludeTicketsList) excludeTicketsList.innerHTML = '';
      return;
    }
    populateExcludeTicketsSelect(labelName);
    const excludedIds = getExcludedTicketIds();
    if (viewType === 'timeline') {
      renderTimelineView(matrixContainer, labelName, excludedIds, assigneeFilter);
    } else if (viewType === 'ticketProgress') {
      renderTicketProgress(matrixContainer, labelName, excludedIds, assigneeFilter);
    } else {
      renderProgressMatrix(matrixContainer, labelName, excludedIds, assigneeFilter);
    }
  }

  // 外部からグラフを再描画できるように参照を保持
  refreshGraphPanel = updateGraphPanel;
  window.refreshGraphPanel = updateGraphPanel;

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
      const assigneeFilter = state.graphAssignees || [];
      // 現在のビュータイプに応じて適切な関数を呼び出す
      if (graphViewSelect) {
        if (graphViewSelect.value === 'timeline') {
          renderTimelineView(matrixContainer, graphLabelSelect.value, excludedIds, assigneeFilter);
        } else if (graphViewSelect.value === 'ticketProgress') {
          renderTicketProgress(matrixContainer, graphLabelSelect.value, excludedIds, assigneeFilter);
        } else {
          renderProgressMatrix(matrixContainer, graphLabelSelect.value, excludedIds, assigneeFilter);
        }
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

  // グラフ設定を保存
  let saveGraphSettings = function() {
    const settings = loadUserSettings();
    settings.graph = {
      visible: isGraphPanelOpen(),
      label: graphLabelSelect?.value || '',
      viewType: graphViewSelect?.value || 'matrix',
      assignees: state.graphAssignees || [],
      excludedTicketIds: Array.from(excludedTicketSet),
      height: graphPanel?.style.height || '20vh'
    };
    saveUserSettings(settings);
  };
  // 外部から呼び出せるように公開
  window.saveGraphSettings = saveGraphSettings;

  // グラフパネルを閉じる関数（他のモジュールから呼び出し可能）
  function closeGraphPanelInternal() {
    if (!isGraphPanelOpen()) return;
    setGraphPanelOpen(false);
    if (graphToggleBtn) graphToggleBtn.classList.remove('active');
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
    saveGraphSettings();
  }

  // 外部からグラフパネルを閉じるためのコールバックを登録
  setCloseGraphPanelCallback(closeGraphPanelInternal);

  // グラフパネルを開く共通処理（保存設定復元含む）
  function openGraphPanelWithRestore() {
    setGraphPanelOpen(true);
    if (graphToggleBtn) graphToggleBtn.classList.add('active');
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
    // ラベルリストを設定
    populateGraphLabelSelect();
    // 保存された設定を復元
    const savedSettings = loadUserSettings();
    const savedLabel = savedSettings?.graph?.label || '';
    const savedViewType = savedSettings?.graph?.viewType || 'matrix';
    // 後方互換: 旧単一文字列形式 (assignee) も対応
    const savedAssignees = Array.isArray(savedSettings?.graph?.assignees)
      ? savedSettings.graph.assignees
      : (savedSettings?.graph?.assignee ? [savedSettings.graph.assignee] : []);
    const savedExcludedIds = savedSettings?.graph?.excludedTicketIds || [];
    const savedHeight = savedSettings?.graph?.height || '20vh';
    
    const labels = getLabelSuggestions();
    if (graphLabelSelect && labels && labels.length > 0) {
      if (savedLabel && labels.includes(savedLabel)) {
        graphLabelSelect.value = savedLabel;
      } else {
        graphLabelSelect.value = labels[0];
      }
    }
    // ビュータイプを復元
    if (graphViewSelect) {
      graphViewSelect.value = savedViewType;
    }
    // 高さを復元
    graphPanel.style.height = savedHeight;
    // 除外チケットセットを復元
    excludedTicketSet.clear();
    savedExcludedIds.forEach(id => excludedTicketSet.add(id));
    updateExcludeButtonLabel();
    // 担当者フィルタを復元
    const validAssignees = savedAssignees.filter(a => (state.assigneeSuggestions || []).includes(a));
    state.graphAssignees = validAssignees;
    // 担当者ドロップダウンを初期化
    renderGraphAssigneeSelect();
    // グラフを更新
    updateGraphPanel();
    saveGraphSettings();
  }

  // グラフトグルボタン
  if (graphToggleBtn) {
    graphToggleBtn.addEventListener('click', () => {
      if (isGraphPanelOpen()) {
        closeGraphPanelInternal();
      } else {
        openGraphPanelWithRestore();
      }
    });
  }

  // 初期化: 保存設定を復元して担当者ドロップダウンを初期化
  // グラフパネルが表示されている場合は自動復元
  const initSavedSettings = loadUserSettings();
  const initSavedAssignees = Array.isArray(initSavedSettings?.graph?.assignees)
    ? initSavedSettings.graph.assignees
    : (initSavedSettings?.graph?.assignee ? [initSavedSettings.graph.assignee] : []);
  const initValidAssignees = initSavedAssignees.filter(a => (state.assigneeSuggestions || []).includes(a));
  state.graphAssignees = initValidAssignees;
  // ラベルリストを設定
  populateGraphLabelSelect();
  // 担当者ドロップダウンを初期化（F5後もクリック可能に）
  renderGraphAssigneeSelect();
  // 除外チケットセットを復元
  const initSavedExcludedIds = initSavedSettings?.graph?.excludedTicketIds || [];
  initSavedExcludedIds.forEach(id => excludedTicketSet.add(id));
  updateExcludeButtonLabel();
  // ビュータイプを復元
  if (graphViewSelect && initSavedSettings?.graph?.viewType) {
    graphViewSelect.value = initSavedSettings.graph.viewType;
  }
  // 保存されたラベルを復元
  const initLabels = getLabelSuggestions();
  if (graphLabelSelect && initLabels && initLabels.length > 0) {
    const initSavedLabel = initSavedSettings?.graph?.label || '';
    if (initSavedLabel && initLabels.includes(initSavedLabel)) {
      graphLabelSelect.value = initSavedLabel;
    } else {
      graphLabelSelect.value = initLabels[0];
    }
  }
  // グラフパネルが保存されている場合は自動表示
  if (initSavedSettings?.graph?.visible === true) {
    openGraphPanelWithRestore();
  }

  // ラベル変更イベント
  if (graphLabelSelect) {
    graphLabelSelect.addEventListener('change', () => {
      updateGraphPanel();
      saveGraphSettings();
    });
  }

  // 担当者フィルタ変更イベントは assignees.js の renderGraphAssigneeSelect 内で処理

  // ビュー切替イベント
  if (graphViewSelect) {
    graphViewSelect.addEventListener('change', () => {
      updateGraphPanel();
      saveGraphSettings();
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
    const minHeight = 50;
    const maxHeight = window.innerHeight - 20;

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
      saveGraphSettings();
    });
  }

  // 保存されたグラフ設定を復元
  const settings = loadUserSettings();
  const g = settings.graph;
  if (g) {
    // グラフパネル表示/非表示を復元
    if (g.visible) {
      setGraphPanelOpen(true);
      graphToggleBtn.classList.add('active');
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
      // 高さを先に復元
      if (g.height) {
        graphPanel.style.height = g.height;
      }
      // レンダリング完了後に高さを取得してレイアウトを調整
      requestAnimationFrame(() => {
        const panelHeight = graphPanel.offsetHeight;
        const remainingHeight = window.innerHeight - panelHeight;
        const kanbanMain = document.querySelector('.kanban-main');
        const kanbanBoard = document.querySelector('.kanban-board');
        if (kanbanMain) {
          kanbanMain.style.height = `${remainingHeight}px`;
        }
        if (kanbanBoard) {
          kanbanBoard.style.height = `${remainingHeight}px`;
        }
        if (bottomLeftButtons) {
          bottomLeftButtons.style.bottom = `${panelHeight + 32}px`;
        }
        // グラフを描画
        if (graphLabelSelect && graphLabelSelect.value) {
          updateGraphPanel();
        }
      });
      populateGraphLabelSelect();
      // ラベル選択を復元
      if (g.label && graphLabelSelect) {
        graphLabelSelect.value = g.label;
      }
      // ビュータイプを復元
      if (g.viewType && graphViewSelect) {
        graphViewSelect.value = g.viewType;
      }
      // 除外チケットIDを復元
      if (g.excludedTicketIds) {
        g.excludedTicketIds.forEach(id => excludedTicketSet.add(id));
      }
    } else {
      // 非表示の場合も設定値を復元（次回表示时用）
      populateGraphLabelSelect();
      if (g.label && graphLabelSelect) {
        graphLabelSelect.value = g.label;
      }
      if (g.viewType && graphViewSelect) {
        graphViewSelect.value = g.viewType;
      }
      if (g.excludedTicketIds) {
        g.excludedTicketIds.forEach(id => excludedTicketSet.add(id));
      }
    }
  }
}

// ===== 実績入力ウィンドウ =====
function initActualTablePanel() {
  const actualToggleBtn = document.getElementById('actualInputBtn');
  const actualModalOverlay = document.getElementById('actualModalOverlay');
  const assigneeSelect = document.getElementById('actualTableAssigneeSelect');

  if (!actualModalOverlay) {
    logError('[app] actualModalOverlay not found in DOM');
    return;
  }

  // 担当者フィルタを初期化（検索ウィンドウの担当者と同じ）
  const assignees = state.assigneeSuggestions || [];
  if (assigneeSelect) {
    assigneeSelect.innerHTML = '<option value="">全担当者</option>';
    assignees.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a;
      assigneeSelect.appendChild(opt);
    });
    // 保存された担当者を復元（なければフィルタの担当者を使用）
    const savedSettings = loadUserSettings();
    const savedAssignee = savedSettings?.actual?.assignee || '';
    if (savedAssignee) {
      assigneeSelect.value = savedAssignee;
    } else {
      const filterAssignee = document.getElementById('filterAssignee');
      if (filterAssignee && filterAssignee.value) {
        assigneeSelect.value = filterAssignee.value;
      }
    }
  }

  // トグルボタン
  if (actualToggleBtn) {
    actualToggleBtn.addEventListener('click', () => {
      if (actualModalOverlay.classList.contains('active')) {
        actualModalOverlay.classList.remove('active');
        saveActualState();
      } else {
        actualModalOverlay.classList.add('active');
        // 表を初期描画
        initActualTable();
      }
    });
  }

  // F5後に実績入力画面を復元
  const savedSettings = loadUserSettings();
  if (savedSettings?.actual?.visible) {
    actualModalOverlay.classList.add('active');
    initActualTable();
  }
}

// ===== SignalR 接続 =====
let signalRConnection = null;
let refreshGraphPanel = null;

/**
 * SignalR 接続を確立する
 */
function startSignalRConnection() {
  const token = getToken();
  if (!token) {
    console.log('[SignalR] No token, skipping connection');
    return;
  }

  // 既存接続があれば切断
  if (signalRConnection) {
    signalRConnection.stop();
  }

  signalRConnection = new signalR.HubConnectionBuilder()
    .withUrl('/ticketHub', {
      accessTokenFactory: () => token
    })
    .withAutomaticReconnect()
    .build();

  // チケット変更イベント受信時に画面を更新（デバウンス付き）
  // 重複通知の場合、タイマーをリセットして最後の通知から延期して再読み込み
  let ticketChangedTimeout = null;
  signalRConnection.on('TicketChanged', async () => {
    // 短時間内の重複通知の場合、タイマーをリセット（最後の通知から500ms後に再読み込み）
    if (ticketChangedTimeout !== null) {
      console.log('[SignalR] TicketChanged debounce reset');
      clearTimeout(ticketChangedTimeout);
    }
    ticketChangedTimeout = setTimeout(async () => {
      ticketChangedTimeout = null;
      console.log('[SignalR] TicketChanged received, refreshing...');
      try {
        await loadTickets();
        console.log('[SignalR] Tickets loaded successfully');
        renderAllTickets();
        console.log('[SignalR] Tickets rendered successfully');
        // グラフパネルが開いている場合はグラフも更新
        if (isGraphPanelOpen() && refreshGraphPanel !== null) {
          refreshGraphPanel();
          console.log('[SignalR] Graph panel refreshed');
        }
      } catch (error) {
        console.error('[SignalR] Failed to refresh tickets:', error);
        console.error('[SignalR] Error stack:', error.stack);
      }
    }, 500);
  });

  signalRConnection.start()
    .then(() => console.log('[SignalR] Connected'))
    .catch(err => console.error('[SignalR] Connection failed:', err));
}

/**
 * SignalR 接続を停止する
 */
function stopSignalRConnection() {
  if (signalRConnection) {
    signalRConnection.stop();
    signalRConnection = null;
    console.log('[SignalR] Disconnected');
  }
}

// ===== イベントコントローラーのクリーンアップ =====
window.addEventListener('beforeunload', () => {
  eventController?.abort();
  stopSignalRConnection();
});

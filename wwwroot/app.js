/**
 * カンバンボード - メインエントリーポイント
 * 各モジュールを統合して初期化
 */

import { state } from './modules/state.js';
import { loadTickets, loadSuggestions } from './modules/api.js';
import { renderAllTickets } from './modules/renderer.js';
import { setupDropZones } from './modules/dragdrop.js';
import { initModal, openNewModal } from './modules/modal.js';
import { renderLabelSelect } from './modules/labels.js';
import { renderAssigneeSelect } from './modules/assignees.js';
import { addChildTask } from './modules/childtasks.js';
import { initHistory } from './modules/history.js';
import { populateAssigneeFilter, initFilter, initTicketSearch, initMainAssigneeFilter, initFilterToggle } from './modules/filter.js';
import { initArchive } from './modules/archive.js';
import { initMemo, updateMemoColumn } from './modules/memo.js';
import { init as initSettings, load as loadSettings } from './modules/settings.js';
import { getToken, login, logout, showLoginScreen, showAppScreen, getUsername } from './modules/auth.js';
import { logInfo, logError, copyToClipboard, exportAsText, getLogBuffer, onUIUpdate } from './modules/logger.js';
import { renderProgressMatrix, getTicketsByLabel } from './modules/charts.js';

/**
 * アプリケーションのメイン初期化処理
 */
async function initApp() {
    console.log('[app] DOMContentLoaded fired');
    // 初期化順序：依存関係に従う

    // 1. モーダル関連イベント
    try {
        console.log('[app] Initializing modal...');
        initModal();
        console.log('[app] Modal initialized');
    } catch (e) {
        console.error('[app] Error initializing modal:', e);
    }

    // 2. 履歴ダイアログ
    try {
        initHistory();
        console.log('[app] History initialized');
    } catch (e) {
        console.error('[app] Error initializing history:', e);
    }

    // 3. ドラッグ＆ドロップ
    try {
        setupDropZones();
        console.log('[app] DragDrop initialized');
    } catch (e) {
        console.error('[app] Error initializing dragdrop:', e);
    }

    // 4. アーカイブトグル
    try {
        initArchive();
        console.log('[app] Archive initialized');
    } catch (e) {
        console.error('[app] Error initializing archive:', e);
    }

    // 5. メモ機能
    try {
        initMemo();
        console.log('[app] Memo initialized');
    } catch (e) {
        console.error('[app] Error initializing memo:', e);
    }

    // 5.5 ドロップダウン外クリックで閉じる
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
    });

    // 6. 設定パネル
    initSettings();

    // 6. カラムヘッダーの追加ボタン（todo/doing/done）
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
        console.warn('[app] addChildTaskBtn not found in DOM');
    }

    // 8. ログアウトボタン
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.classList.remove('hidden');
        logoutBtn.style.display = 'block';
        logoutBtn.addEventListener('click', async () => {
            if (!confirm('ログアウトしますか？')) return;
            await logout();
            showLoginScreen();
        });
    }

    // 9. サーバーからデータをロード
    try {
        console.log('[app] Starting initialization...');
        console.log('[app] state address:', state, 'id:', state.ticketCounter);

        // 設定データを先に読み込み（ラベル色情報用）
        await loadSettings();
        console.log('[app] loadSettings done');

        await loadTickets();
        console.log('[app] loadTickets done, tickets:', state.allTickets.length);

        await loadSuggestions();
        console.log('[app] loadSuggestions done, assigneeSuggestions:', state.assigneeSuggestions);
        console.log('[app] state after loadSuggestions:', state.assigneeSuggestions, 'length:', state.assigneeSuggestions.length);

        // フィルターをpopulate
        populateAssigneeFilter();
        console.log('[app] populateAssigneeFilter done');

        // ログインユーザーのチケットをデフォルトで表示
        const username = getUsername();
        if (username) {
            const assigneeSelect = document.getElementById('assigneeFilterSelect');
            if (assigneeSelect) {
                assigneeSelect.value = username;
                console.log('[app] Default assignee filter set to:', username);
            }
        }

        // チケットを描画
        renderAllTickets();

        // 初期状態でメモカラムを更新
        updateMemoColumn();

        // フィルターイベントを設定
        await initFilter();

        // チケット検索を初期化
        initTicketSearch();

        // メイン担当限定フィルターを初期化
        initMainAssigneeFilter();

        // 検索ウィンドウトグルを初期化
        initFilterToggle();

        // アプリ画面を表示
        showAppScreen();
    } catch (error) {
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
                loginError.style.display = 'block';
            }
            return;
        }

        try {
            await login(username, password);
            // ログイン成功 → アプリ初期化
            await initApp();
        } catch (error) {
            if (loginError) {
                loginError.textContent = error.message || 'ログインに失敗しました';
                loginError.classList.remove('hidden');
                loginError.style.display = 'block';
            }
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // 認証チェック
    const token = getToken();
    if (token) {
        // トークンあり → アプリ初期化
        await initApp();
    } else {
        // トークンなし → ログイン画面表示
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
 * ログパネルの初期化
 */
function initLogsPanel() {
    const logsBtn = document.getElementById('logsBtn');
    const logsPanel = document.getElementById('logsPanel');
    const logsCloseBtn = document.getElementById('logsCloseBtn');
    const logsCopyBtn = document.getElementById('logsCopyBtn');
    const logsExportBtn = document.getElementById('logsExportBtn');
    const logsLevelFilter = document.getElementById('logsLevelFilter');
    const logsSearchInput = document.getElementById('logsSearchInput');
    const logsFetchServerBtn = document.getElementById('logsFetchServerBtn');

    // ログボタンクリック → パネル表示
    if (logsBtn) {
        logsBtn.addEventListener('click', () => {
            if (logsPanel) {
                logsPanel.classList.toggle('active');
                if (logsPanel.classList.contains('active')) {
                    renderLogEntries();
                }
            }
        });
    }

    // 閉じるボタン
    if (logsCloseBtn && logsPanel) {
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
        if (logsPanel && logsPanel.classList.contains('active')) {
            renderLogEntries();
        }
    });
}

// ログパネルを初期化
initLogsPanel();

// ===== グラフパネル関連 =====

/**
 * グラフパネルの初期化
 */
function initGraphPanel() {
    const graphToggleBtn = document.getElementById('graphToggleBtn');
    const graphPanel = document.getElementById('graphPanel');
    const graphPanelBody = document.getElementById('graphPanelBody');
    const graphPanelResizeHandle = document.getElementById('graphPanelResizeHandle');
    const graphLabelSelect = document.getElementById('graphLabelFilter');
    const excludeToggleBtn = document.getElementById('graphExcludeToggleBtn');
    const excludeTicketsList = document.getElementById('excludeTicketsList');
    const excludeDropdown = document.getElementById('excludeTicketsDropdown');
    const matrixContainer = document.getElementById('matrixTableContainer');
    const mainContainer = document.querySelector('.main-container');
    const bottomLeftButtons = document.querySelector('.bottom-left-buttons');

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
        if (!labelName) {
            if (matrixContainer) matrixContainer.innerHTML = '';
            if (excludeTicketsList) excludeTicketsList.innerHTML = '';
            return;
        }
        // 除外チケットリストを更新
        populateExcludeTicketsSelect(labelName);
        // 表を更新
        const excludedIds = getExcludedTicketIds();
        renderProgressMatrix(matrixContainer, labelName, excludedIds);
    }

    // グラフトグルボタン
    if (graphToggleBtn) {
        graphToggleBtn.addEventListener('click', () => {
            state.graphPanelOpen = !state.graphPanelOpen;
            if (state.graphPanelOpen) {
                // パネル表示
                if (graphPanel) {
                    graphPanel.classList.remove('hidden');
                    graphPanel.style.display = 'flex';
                }
                if (graphPanelBody) {
                    graphPanelBody.classList.remove('hidden');
                    graphPanelBody.style.display = 'block';
                }
                if (mainContainer) mainContainer.classList.add('graph-panel-open');
                if (bottomLeftButtons) {
                    bottomLeftButtons.classList.add('graph-panel-open');
                }
                // カンバンボードの高さをグラフパネルの高さに応じて調整
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
                // デフォルトで最初のラベルを選択
                if (graphLabelSelect && state.labelSuggestions && state.labelSuggestions.length > 0) {
                    graphLabelSelect.value = state.labelSuggestions[0];
                    updateGraphPanel();
                }
            } else {
                // パネル非表示
                if (graphPanel) {
                    graphPanel.classList.add('hidden');
                    graphPanel.style.display = 'none';
                }
                if (graphPanelBody) {
                    graphPanelBody.classList.add('hidden');
                    graphPanelBody.style.display = 'none';
                }
                if (mainContainer) mainContainer.classList.remove('graph-panel-open');
                if (bottomLeftButtons) {
                    bottomLeftButtons.classList.remove('graph-panel-open');
                    bottomLeftButtons.style.bottom = '';
                }
                // カンバンボードの高さをリセット
                const kanbanMain = document.querySelector('.kanban-main');
                const kanbanBoard = document.querySelector('.kanban-board');
                if (kanbanMain) {
                    kanbanMain.style.height = '';
                }
                if (kanbanBoard) {
                    kanbanBoard.style.height = '';
                }
                // グラフパネルの高さをリセット
                if (graphPanel) graphPanel.style.height = '20vh';
            }
        });
    }

    // ラベル変更イベント
    if (graphLabelSelect) {
        graphLabelSelect.addEventListener('change', () => {
            updateGraphPanel();
        });
    }

    // 除外チケットドロップダウントグル
    if (excludeToggleBtn && excludeTicketsList) {
        excludeToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            excludeTicketsList.classList.toggle('active');
        });
        // ドロップ内のクリックは伝播阻止
        excludeTicketsList.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    // クリックで閉じる
    document.addEventListener('click', () => {
        if (excludeTicketsList) {
            excludeTicketsList.classList.remove('active');
        }
    });
    if (excludeDropdown) {
        excludeDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // bottomLeftButtons の bottom とカンバンボードの高さをグラフパネルの高さに合わせて更新
    function updatePanelLayout(panelHeight) {
        if (bottomLeftButtons) {
            bottomLeftButtons.style.bottom = `${panelHeight + 32}px`;
        }
        // カンバンボードの高さをグラフパネルの高さに応じて調整
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
        // グラフも再描画
        if (graphLabelSelect && graphLabelSelect.value) {
            const excludedIds = getExcludedTicketIds();
            renderProgressMatrix(matrixContainer, graphLabelSelect.value, excludedIds);
        }
    };
    window.addEventListener('resize', handleBrowserResize);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleBrowserResize);
    }

    // リサイズハンドルによる高さ変更
    if (graphPanelResizeHandle && graphPanel) {
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        const minHeight = 150; // 最小高さ (px)
        const maxHeight = window.innerHeight - 100; // 最大高さ (px)

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
            // グラフを再描画してサイズを合わせる
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

// グラフパネルを初期化
initGraphPanel();

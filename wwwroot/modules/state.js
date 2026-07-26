/**
 * アプリケーションの状態管理
 * 全モジュールから共有されるデータを一元管理
 * Proxyベースの変更通知 + Mutation関数による安全な状態管理
 */

import { updateHiddenChildTasks, loadUserSettings } from './userSettings.js';
import { getToken } from './auth.js';

// APIベースURL
export const API_BASE = '/api/tickets';

// ===== 内部状態（private） =====
const internal = {
    tickets: new Map(),       // ticketId -> Ticket
    ticketOrder: [],          // ticketIdの順序配列
    ticketCounter: 0,
    filter: {
        assignee: '',
        mainOnly: false,
        keyword: '',
        label: ''
    },
    ui: {
        graphPanelOpen: false,
        ticketLocked: false,
        ticketEmergency: false,
        hiddenChildTasks: new Set(),  // "ticketId:childId"形式で非表示の子タスクを管理
        graphAssignees: []            // グラフパネルで選択中の担当者配列
    },
    modal: {
        editingTicketId: null,
        currentLabels: [],
        currentAssignees: [],
        mainAssignee: null,
        currentChildTasks: [],
        newTicketColumn: 'todo',
        currentCategory: ''  // 集計ID（チケットレベル）
    },
    suggestions: {
        labels: [],
        assignees: []
    }
};

// ===== Event Bus =====
const eventListeners = {};

export function on(event, callback) {
    if (!eventListeners[event]) {
        eventListeners[event] = new Set();
    }
    // 重複登録防止（Set使用）
    eventListeners[event].add(callback);

    // unsubscribe関数を返す
    return () => off(event, callback);
}

export function off(event, callback) {
    if (eventListeners[event]) {
        eventListeners[event].delete(callback);
    }
}

export function emit(event, data) {
    if (eventListeners[event]) {
        // コピーして反復（実行中の削除に安全）
        [...eventListeners[event]].forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`Event listener error for ${event}:`, e);
            }
        });
    }
}

// ===== Proxyベースの変更通知 =====
// 注意: Proxy はトップレベルのプロパティのみを監視する。
// internal.filter.assignee = 'xxx' のようなネストされた変更は検出されない。
// 変更通知が必要な場合は setFilter() などの mutation 関数を使用すること。
const stateProxy = new Proxy(internal, {
    set(target, property, value) {
        const oldValue = target[property];
        target[property] = value;
        if (oldValue !== value) {
            emit('state-changed', { property, oldValue, value });
        }
        return true;
    }
});

// ===== 安全なparseInt =====
// 無効な入力は0にフォールバック（ticketCounter用）
function safeParseInt(id) {
    const num = Number(id);
    return Number.isFinite(num) ? num : 0;
}

// ===== Mutation関数 =====

/**
 * チケットを設定
 * @param {string} ticketId - チケットID
 * @param {object} ticket - チケットデータ
 */
export function setTicket(ticketId, ticket) {
    internal.tickets.set(ticketId, ticket);
    if (!internal.ticketOrder.includes(ticketId)) {
        internal.ticketOrder.push(ticketId);
    }
    const id = safeParseInt(ticket.id);
    internal.ticketCounter = Math.max(internal.ticketCounter, id);
    emit('ticket-changed', { ticketId, ticket });
}

/**
 * チケットを追加
 * @param {object} ticket - チケットデータ
 */
export function addTicket(ticket) {
    internal.tickets.set(ticket.ticketId, ticket);
    internal.ticketOrder.push(ticket.ticketId);
    const id = safeParseInt(ticket.id);
    internal.ticketCounter = Math.max(internal.ticketCounter, id);
    emit('ticket-added', { ticket });
}

/**
 * チケットを削除
 * @param {string} ticketId - チケットID
 */
export function removeTicket(ticketId) {
    internal.tickets.delete(ticketId);
    internal.ticketOrder = internal.ticketOrder.filter(id => id !== ticketId);
    emit('ticket-removed', { ticketId });
}

/**
 * チケットのフィールドを更新
 * @param {string} ticketId - チケットID
 * @param {string} field - フィールド名
 * @param {*} value - 更新値
 */
export function updateTicketField(ticketId, field, value) {
    const ticket = internal.tickets.get(ticketId);
    if (ticket) {
        ticket[field] = value;
        emit('ticket-changed', { ticketId, ticket });
    }
}

/**
 * チケットデータを初期化
 * @param {Array} tickets - チケット配列
 */
export function initTickets(tickets) {
    internal.tickets.clear();
    internal.ticketOrder = [];
    internal.ticketCounter = 0;
    if (Array.isArray(tickets)) {
        tickets.forEach(ticket => {
            internal.tickets.set(ticket.ticketId, ticket);
            internal.ticketOrder.push(ticket.ticketId);
            const id = safeParseInt(ticket.id);
            internal.ticketCounter = Math.max(internal.ticketCounter, id);
        });
    }
    emit('tickets-initialized', { count: internal.ticketOrder.length });
}

/**
 * モーダル状態を設定（部分的な更新）
 * @param {object} partialState - 部分的な状態オブジェクト
 */
export function setModalState(partialState) {
    Object.assign(internal.modal, partialState);
    emit('modal-changed', internal.modal);
}

/**
 * モーダル状態リセット
 */
export function resetModalState() {
    internal.modal.editingTicketId = null;
    internal.modal.currentLabels = [];
    internal.modal.currentAssignees = [];
    internal.modal.mainAssignee = null;
    internal.modal.currentChildTasks = [];
    internal.modal.newTicketColumn = 'todo';
    internal.modal.currentCategory = '';
    emit('modal-changed', internal.modal);
}

/**
 * フィルターを設定（部分的な更新）
 * @param {object} partial - 部分的なフィルターオブジェクト
 */
export function setFilter(partial) {
    Object.assign(internal.filter, partial);
    emit('filter-changed', internal.filter);
}

/**
 * ラベルサジェストを設定
 * @param {string[]} labels - ラベル配列
 */
export function setLabelSuggestions(labels) {
    internal.suggestions.labels = labels;
    emit('suggestions-changed', { type: 'labels' });
}

/**
 * 担当者サジェストを設定
 * @param {string[]} assignees - 担当者配列
 */
export function setAssigneeSuggestions(assignees) {
    internal.suggestions.assignees = assignees;
    emit('suggestions-changed', { type: 'assignees' });
}

/**
 * 子タスク追加
 */
export function addChildTaskToState(task) {
    internal.modal.currentChildTasks.push(task);
    emit('modal-changed', internal.modal);
}

/**
 * 子タスク更新
 */
export function updateChildTaskInState(id, updates) {
    const task = internal.modal.currentChildTasks.find(t => t.id === id);
    if (task) {
        Object.assign(task, updates);
        emit('modal-changed', internal.modal);
    }
}

/**
 * 子タスク削除
 */
export function removeChildTaskFromState(id) {
    internal.modal.currentChildTasks = internal.modal.currentChildTasks.filter(t => t.id !== id);
    emit('modal-changed', internal.modal);
}

/**
 * 子タスク一覧取得
 */
export function getChildTasks() {
    return [...internal.modal.currentChildTasks];
}

/**
 * 子タスク順序入れ替え（ドラッグ＆ドロップ用）
 * targetIndex は「splice後の配列における最終的な挿入位置」
 */
export function reorderChildTasks(fromId, targetIndex) {
    const tasks = internal.modal.currentChildTasks;
    const fromIndex = tasks.findIndex(t => t.id === fromId);
    if (fromIndex < 0) return;
    if (fromIndex === targetIndex) return;
    
    const [task] = tasks.splice(fromIndex, 1);
    // targetIndex は「元の配列（splice前）での挿入位置」
    // splice で fromIndex の要素を削除した後、挿入位置を補正する
    // - fromIndex < targetIndex: 削除でtarget以降の要素が1つ左にシフトしたため -1
    // - fromIndex > targetIndex: 削除がtargetより前なので影響なし
    let insertIndex = targetIndex;
    if (targetIndex > fromIndex) {
        insertIndex = targetIndex - 1;
    }
    // 境界チェック
    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > tasks.length) insertIndex = tasks.length;
    tasks.splice(insertIndex, 0, targetIndex <= fromIndex ? task : task);
    emit('modal-changed', internal.modal);
}

// ===== 担当者関連のmutation関数 =====

/**
 * 現在選択中の担当者一覧取得
 */
export function getCurrentAssignees() {
    return [...internal.modal.currentAssignees];
}

/**
 * 担当者を追加（重複チェック付き）
 */
export function addAssigneeToState(text) {
    const t = text.trim();
    if (t && !internal.modal.currentAssignees.includes(t)) {
        internal.modal.currentAssignees.push(t);
        if (!internal.modal.mainAssignee) {
            internal.modal.mainAssignee = t;
        }
        emit('modal-changed', internal.modal);
    }
}

/**
 * 担当者を削除
 */
export function removeAssigneeFromState(index) {
    if (index < 0 || index >= internal.modal.currentAssignees.length) return;
    const removed = internal.modal.currentAssignees[index];
    internal.modal.currentAssignees.splice(index, 1);
    if (internal.modal.mainAssignee === removed) {
        internal.modal.mainAssignee = internal.modal.currentAssignees[0] || null;
    }
    emit('modal-changed', internal.modal);
}

/**
 * メイン担当者を設定
 */
export function setMainAssignee(assignee) {
    internal.modal.mainAssignee = assignee;
    emit('modal-changed', internal.modal);
}

/**
 * メイン担当者取得
 */
export function getMainAssignee() {
    return internal.modal.mainAssignee;
}

// ===== ラベル関連のmutation関数 =====

/**
 * 現在選択中のラベル一覧取得
 */
export function getCurrentLabels() {
    return [...internal.modal.currentLabels];
}

/**
 * ラベルを追加（重複チェック付き）
 */
export function addLabelToState(text) {
    const t = text.trim();
    if (t && !internal.modal.currentLabels.includes(t)) {
        internal.modal.currentLabels.push(t);
        emit('modal-changed', internal.modal);
    }
}

/**
 * ラベルを削除
 */
export function removeLabelFromState(labelName) {
    internal.modal.currentLabels = internal.modal.currentLabels.filter(l => l !== labelName);
    emit('modal-changed', internal.modal);
}

// ===== セレクター関数 =====

/**
 * フィルターの担当者取得
 */
export function getFilterAssignee() {
    return internal.filter.assignee || '';
}

/**
 * フィルター全体を取得（読み取り専用コピー）
 */
export function getFilter() {
    return { ...internal.filter };
}

/**
 * 担当者サジェスト一覧取得
 */
export function getAssigneeSuggestions() {
    return [...internal.suggestions.assignees];
}

/**
 * ラベルサジェスト一覧取得
 */
export function getLabelSuggestions() {
    return [...internal.suggestions.labels];
}

// ===== UI状態のmutation関数 =====

/**
 * グラフパネル開閉状態を取得
 */
export function isGraphPanelOpen() {
    return internal.ui.graphPanelOpen;
}

/**
 * グラフパネル開閉状態を設定
 */
export function setGraphPanelOpen(open) {
    internal.ui.graphPanelOpen = open;
    emit('ui-changed', internal.ui);
}

// グラフパネルを閉じるためのコールバック（app.jsから登録）
let closeGraphPanelCallback = null;

/**
 * グラフパネル閉じるコールバックを登録（app.jsから呼び出し）
 */
export function setCloseGraphPanelCallback(fn) {
    closeGraphPanelCallback = fn;
}

/**
 * グラフパネルを閉じる（他のモジュールから呼び出し）
 */
export function closeGraphPanel() {
    if (closeGraphPanelCallback) {
        closeGraphPanelCallback();
    }
}

/**
 * チケットロック状態を取得
 */
export function isTicketLocked() {
    return internal.ui.ticketLocked;
}

/**
 * チケットロック状態を設定
 */
export function setTicketLocked(locked) {
    internal.ui.ticketLocked = locked;
    emit('ui-changed', internal.ui);
}

/**
 * 緊急フラグを取得
 */
export function isTicketEmergency() {
    return internal.ui.ticketEmergency;
}

/**
 * 緊急フラグを設定
 */
export function setTicketEmergency(emergency) {
    internal.ui.ticketEmergency = emergency;
    emit('ui-changed', internal.ui);
}

// ===== モーダル状態のセレクター =====

/**
 * 編集中チケットID取得
 */
export function getEditingTicketId() {
    return internal.modal.editingTicketId;
}

/**
 * 新規チケットカラム取得
 */
export function getNewTicketColumn() {
    return internal.modal.newTicketColumn;
}

/**
 * 新規チケットカラム設定
 */
export function setNewTicketColumn(column) {
    internal.modal.newTicketColumn = column;
    emit('modal-changed', internal.modal);
}

// ===== チケット操作のmutation関数 =====

/**
 * チケットのフィールドを更新
 */
export function updateTicketFieldInOrder(ticketId, field, value) {
    const ticket = internal.tickets.get(ticketId);
    if (ticket) {
        ticket[field] = value;
        emit('ticket-changed', { ticketId, field });
    }
}

/**
 * チケットを削除
 */
export function deleteTicketFromState(ticketId) {
    internal.tickets.delete(ticketId);
    internal.ticketOrder = internal.ticketOrder.filter(id => id !== ticketId);
    emit('ticket-removed', { ticketId });
}

/**
 * チケットIDで検索してインデックスを返す（allTickets配列内）
 */
export function findTicketIndex(ticketId) {
    return internal.ticketOrder.findIndex(id => String(id) === String(ticketId));
}


/**
 * 順序付き全チケット配列
 */
export function getAllTickets() {
    return internal.ticketOrder.map(id => internal.tickets.get(id)).filter(Boolean);
}

/**
 * 単一チケット取得
 */
export function getTicket(ticketId) {
    return internal.tickets.get(ticketId) || null;
}

/**
 * チケット存在チェック
 */
export function hasTicket(ticketId) {
    return internal.tickets.has(ticketId);
}

/**
 * モーダル状態取得（コピー返却）
 */
export function getModalState() {
    return {
        editingTicketId: internal.modal.editingTicketId,
        currentLabels: [...internal.modal.currentLabels],
        currentAssignees: [...internal.modal.currentAssignees],
        mainAssignee: internal.modal.mainAssignee,
        currentChildTasks: internal.modal.currentChildTasks.map(t => ({...t})),
        newTicketColumn: internal.modal.newTicketColumn
    };
}

/**
 * UI状態取得
 */
export function getUiState() {
    return { ...internal.ui };
}

/**
 * チケットカウンター取得
 */
export function getTicketCounter() {
    return internal.ticketCounter;
}

/**
 * サジェスト取得
 */
export function getSuggestions() {
    return {
        labels: [...internal.suggestions.labels],
        assignees: [...internal.suggestions.assignees]
    };
}

// ===== 後方互換用 state オブジェクト（読み取りのみ） =====
// 注意: setter は internal のネストされたプロパティを直接変更するため、
// Proxy は変更を検出できない。各 setter で emit() を明示的に呼び出す。
const backwardCompatState = {
    get ticketCounter() { return internal.ticketCounter; },
    get currentLabels() { return [...internal.modal.currentLabels]; },
    set currentLabels(v) { internal.modal.currentLabels = [...v]; emit('state-changed', { property: 'currentLabels', value: v }); },
    get currentAssignees() { return [...internal.modal.currentAssignees]; },
    set currentAssignees(v) { internal.modal.currentAssignees = [...v]; emit('state-changed', { property: 'currentAssignees', value: v }); },
    get mainAssignee() { return internal.modal.mainAssignee; },
    set mainAssignee(v) { internal.modal.mainAssignee = v; emit('state-changed', { property: 'mainAssignee', value: v }); },
    get currentChildTasks() { return internal.modal.currentChildTasks; },
    set currentChildTasks(v) { internal.modal.currentChildTasks = v; emit('state-changed', { property: 'currentChildTasks', value: v }); },
    get editingTicketId() { return internal.modal.editingTicketId; },
    set editingTicketId(v) { internal.modal.editingTicketId = v; emit('state-changed', { property: 'editingTicketId', value: v }); },
    get newTicketColumn() { return internal.modal.newTicketColumn; },
    set newTicketColumn(v) { internal.modal.newTicketColumn = v; emit('state-changed', { property: 'newTicketColumn', value: v }); },
    get allTickets() { return getAllTickets(); },
    set allTickets(v) {
        initTickets(v);
    },
    get currentTicketData() {
        const obj = {};
        internal.tickets.forEach((ticket, id) => {
            obj[id] = ticket;
        });
        return obj;
    },
    set currentTicketData(v) {
        console.warn('Direct currentTicketData assignment is deprecated. Use setTicket().');
    },
    get labelSuggestions() { return [...internal.suggestions.labels]; },
    set labelSuggestions(v) { internal.suggestions.labels = [...v]; emit('state-changed', { property: 'labelSuggestions', value: v }); },
    get assigneeSuggestions() { return [...internal.suggestions.assignees]; },
    set assigneeSuggestions(v) { internal.suggestions.assignees = [...v]; emit('state-changed', { property: 'assigneeSuggestions', value: v }); },
    get searchKeyword() { return internal.filter.keyword; },
    set searchKeyword(v) { internal.filter.keyword = v; emit('state-changed', { property: 'searchKeyword', value: v }); },
    get filterAssignee() { return internal.filter.assignee; },
    set filterAssignee(v) { internal.filter.assignee = v; emit('state-changed', { property: 'filterAssignee', value: v }); },
    get filterMainOnly() { return internal.filter.mainOnly; },
    set filterMainOnly(v) { internal.filter.mainOnly = v; emit('state-changed', { property: 'filterMainOnly', value: v }); },
    get filterLabel() { return internal.filter.label; },
    set filterLabel(v) { internal.filter.label = v; emit('state-changed', { property: 'filterLabel', value: v }); },
    get mainAssigneeOnly() { return internal.filter.mainOnly; },
    set mainAssigneeOnly(v) { internal.filter.mainOnly = v; emit('state-changed', { property: 'mainAssigneeOnly', value: v }); },
    get graphPanelOpen() { return internal.ui.graphPanelOpen; },
    set graphPanelOpen(v) { internal.ui.graphPanelOpen = v; emit('state-changed', { property: 'graphPanelOpen', value: v }); },
    get ticketLocked() { return internal.ui.ticketLocked; },
    set ticketLocked(v) { internal.ui.ticketLocked = v; emit('state-changed', { property: 'ticketLocked', value: v }); },
    get graphAssignees() { return [...internal.ui.graphAssignees]; },
    set graphAssignees(v) { internal.ui.graphAssignees = [...v]; emit('state-changed', { property: 'graphAssignees', value: v }); }
};

export const state = backwardCompatState;

// 後方互換用 filterState
export const filterState = {
    get assignee() { return internal.filter.assignee; },
    set assignee(v) { internal.filter.assignee = v; },
    get mainOnly() { return internal.filter.mainOnly; },
    set mainOnly(v) { internal.filter.mainOnly = v; },
    get keyword() { return internal.filter.keyword; },
    set keyword(v) { internal.filter.keyword = v; },
    get label() { return internal.filter.label; },
    set label(v) { internal.filter.label = v; }
};

// ===== 後方互換用エイリアス =====
export const initTicketData = initTickets;
export const updateTicketData = setTicket;

// ===== ユーティリティ関数 =====

/**
 * HTMLエスケープ（null/undefined 安全、DOM生成なしの文字列置換）
 */
export function escapeHtml(text) {
    if (text == null) return '';
    let s = String(text);
    s = s.replace(/&/g, '\u0026amp;');
    s = s.replace(/</g, '\u0026lt;');
    s = s.replace(/>/g, '\u0026gt;');
    s = s.replace(/"/g, '\u0026quot;');
    s = s.replace(/'/g, '\u0026#39;');
    return s;
}

// ラベルカラーキャッシュ無効化用関数（renderer.js用）
export let labelColorCacheInvalidated = false;
export function invalidateLabelColorCache() {
    labelColorCacheInvalidated = true;
}

// 設定データ取得（循環インポート回避のためstate.jsに配置）

/**
 * 日付を「月日(曜日)」形式に変換（null安全、toLocaleDateString使用）
 */
export function formatDateWithDay(date) {
    if (!date) return '';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
            weekday: 'short'
        });
    } catch {
        return '';
    }
}

// ===== 子タスク表示/非表示管理 =====

/**
 * 子タスク非表示状態を保存
 */
function saveHiddenChildTasks() {
    updateHiddenChildTasks(list => Array.from(internal.ui.hiddenChildTasks));
}

/**
 * 子タスクの表示/非表示状態を取得
 */
export function isChildTaskHidden(ticketId, childId) {
    const key = `${ticketId}:${childId}`;
    return internal.ui.hiddenChildTasks.has(key);
}

/**
 * 子タスクの表示/非表示状態を設定
 */
export function setChildTaskHidden(ticketId, childId, hidden) {
    const key = `${ticketId}:${childId}`;
    if (hidden) {
        internal.ui.hiddenChildTasks.add(key);
    } else {
        internal.ui.hiddenChildTasks.delete(key);
    }
    saveHiddenChildTasks();
}

/**
 * 子タスク非表示状態を復元
 */
export function restoreHiddenChildTasks() {
    const settings = loadUserSettings();
    if (settings.childTasks && settings.childTasks.hidden && Array.isArray(settings.childTasks.hidden)) {
        settings.childTasks.hidden.forEach(key => {
            internal.ui.hiddenChildTasks.add(key);
        });
    }
}

// ===== カテゴリ関連のgetter/setter =====

/**
 * 現在のモーダルカテゴリを取得
 */
export function getCurrentCategory() {
    return internal.modal.currentCategory || '';
}

/**
 * 現在のモーダルカテゴリを設定
 */
export function setCurrentCategory(category) {
    internal.modal.currentCategory = category || '';
    emit('modal-changed', internal.modal);
}

// ===== 設定データアクセス（settings.js経由） =====

/**
 * 設定データを取得（window.Settings経由で循環依存回避）
 */
export function getSettings() {
    return window.Settings?.settings?.() ?? { users: [], labels: [], holidays: [], memos: {} };
}

/**
 * ラベルカラーキャッシュを無効化して再描画をリクエスト
 */
export function requestRenderAfterSettingsChange() {
    invalidateLabelColorCache();
    emit('render-tickets');
}

// ===== ドラッグ＆ドロップ関連 =====

let draggedTicket = null;

/**
 * ドラッグ中のチケット要素を設定
 */
export function setDraggedTicket(ticket) {
    draggedTicket = ticket;
}

/**
 * ドラッグ中のチケット要素を取得
 */
export function getDraggedTicket() {
    return draggedTicket;
}

// ===== 実績キャッシュ =====

/**
 * 実績データキャッシュ
 * key: ticketId (親) または "ticketId:childTaskId" (子タスク)
 * value: TicketActual[] (日付降順)
 */
const actualCache = new Map();

/**
 * 複数のチケットの実績を一括取得してキャッシュに保存
 * @param {string[]} ticketIds - チケットID配列
 */
export async function loadAllActuals(ticketIds) {
    if (!ticketIds || ticketIds.length === 0) {
        console.log('[state] loadAllActuals: ticketIds为空，跳过');
        return;
    }
    try {
        // URL長制限（414 URI Too Long）を避けるためにバッチ分割
        const batchSize = 50;
        const batches = [];
        for (let i = 0; i < ticketIds.length; i += batchSize) {
            batches.push(ticketIds.slice(i, i + batchSize));
        }
        console.log('[state] loadAllActuals: ticketIds数量', ticketIds.length, 'バッチ数', batches.length);
        
        actualCache.clear();
        
        // 各バッチを並列で取得
        const promises = batches.map(async (batch) => {
            const query = batch.map(id => `ticketIds=${encodeURIComponent(id)}`).join('&');
            const url = `${API_BASE}/actuals/batch?${query}`;
            try {
                const token = getToken();
                const headers = { 'Cache-Control': 'no-cache' };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                const response = await fetch(url, { headers });
                if (!response.ok) {
                    console.warn('[state] loadAllActuals: バッチAPIエラー', response.status, 'ticketIds数', batch.length);
                    return [];
                }
                return await response.json();
            } catch (e) {
                console.warn('[state] loadAllActuals: バッチフェッチ失敗', e, 'ticketIds数', batch.length);
                return [];
            }
        });
        
        const results = await Promise.all(promises);
        const allActuals = results.flat();
        console.log('[state] loadAllActuals: 取得した実績データ数', allActuals.length);
        
        // ticketIdごとにグループ化
        for (const actual of allActuals) {
            const key = actual.childTaskId
                ? `${actual.ticketId}:${actual.childTaskId}`
                : actual.ticketId;
            if (!actualCache.has(key)) {
                actualCache.set(key, []);
            }
            actualCache.get(key).push(actual);
        }
        
        // 各キャッシュを日付降順にソート
        for (const [, actuals] of actualCache) {
            actuals.sort((a, b) => new Date(b.date) - new Date(a.date));
        }
        console.log('[state] loadAllActuals: キャッシュキー数', actualCache.size, 'キー一覧', Array.from(actualCache.keys()).slice(0, 20));
    } catch (e) {
        console.warn('[state] Failed to load actuals:', e);
    }
}

/**
 * チケットの最新進捗率を取得（実績キャッシュから）
 * @param {string} ticketId - チケットID
 * @param {string} [childTaskId] - 子タスクID（省略可）
 * @returns {number} 進捗率 (0-100)、実績なしの場合は0
 */
export function getTicketProgress(ticketId, childTaskId) {
    const key = childTaskId ? `${ticketId}:${childTaskId}` : ticketId;
    const actuals = actualCache.get(key);
    if (!actuals || actuals.length === 0) return 0;
    // 最新のProgressRateを返す（日付降順でソート済み）
    const latest = actuals.find(a => a.progressRate !== null && a.progressRate !== undefined);
    return latest ? latest.progressRate : 0;
}

/**
 * 単一チケットの実績をキャッシュに保存
 * @param {string} ticketId - チケットID
 * @param {Array} actuals - 実績データ
 */
export function cacheActualsForTicket(ticketId, actuals) {
    if (!actuals || !Array.isArray(actuals)) return;
    // 日付降順にソート
    actuals.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    for (const actual of actuals) {
        const key = actual.childTaskId
            ? `${ticketId}:${actual.childTaskId}`
            : ticketId;
        if (!actualCache.has(key)) {
            actualCache.set(key, []);
        }
        actualCache.get(key).push(actual);
    }
    
    // 各キャッシュを日付降順に再ソート
    for (const [, items] of actualCache) {
        items.sort((a, b) => new Date(b.date) - new Date(a.date));
    }
}

/**
 * 実績キャッシュをクリア
 */
export function clearActualCache() {
    actualCache.clear();
}

/**
 * 実績キャッシュの内容をデバッグ用に取得
 * @param {string} ticketId - チケットID
 * @returns {Array} 実績データ配列
 */
export function getActualCacheForTicket(ticketId) {
    return actualCache.get(ticketId) || [];
}

/**
 * 実績キャッシュの全キーを取得（デバッグ用）
 * @returns {string[]} キーの配列
 */
export function getActualCacheKeys() {
    return Array.from(actualCache.keys());
}

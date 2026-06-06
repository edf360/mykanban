/**
 * アプリケーションの状態管理
 * 全モジュールから共有されるデータを一元管理
 * Proxyベースの変更通知 + Mutation関数による安全な状態管理
 */

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
        keyword: ''
    },
    ui: {
        graphPanelOpen: false,
        ticketLocked: false,
        ticketEmergency: false
    },
    modal: {
        editingTicketId: null,
        currentLabels: [],
        currentAssignees: [],
        mainAssignee: null,
        currentChildTasks: [],
        newTicketColumn: 'todo'
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
function safeParseInt(id) {
    const num = Number(id);
    return Number.isFinite(num) ? num : 0;
}

// ===== Mutation関数 =====

/**
 * チケット設定
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
 * チケット追加
 */
export function addTicket(ticket) {
    internal.tickets.set(ticket.ticketId, ticket);
    internal.ticketOrder.push(ticket.ticketId);
    const id = safeParseInt(ticket.id);
    internal.ticketCounter = Math.max(internal.ticketCounter, id);
    emit('ticket-added', { ticket });
}

/**
 * チケット削除
 */
export function removeTicket(ticketId) {
    internal.tickets.delete(ticketId);
    internal.ticketOrder = internal.ticketOrder.filter(id => id !== ticketId);
    emit('ticket-removed', { ticketId });
}

/**
 * チケットフィールド更新
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
 * モーダル状態設定（部分的な更新）
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
    emit('modal-changed', internal.modal);
}

/**
 * フィルター設定（部分的な更新）
 */
export function setFilter(partial) {
    Object.assign(internal.filter, partial);
    emit('filter-changed', internal.filter);
}

/**
 * ラベルサジェスト設定
 */
export function setLabelSuggestions(labels) {
    internal.suggestions.labels = labels;
    emit('suggestions-changed', { type: 'labels' });
}

/**
 * 担当者サジェスト設定
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
const backwardCompatState = {
    get ticketCounter() { return internal.ticketCounter; },
    get currentLabels() { return [...internal.modal.currentLabels]; },
    set currentLabels(v) { internal.modal.currentLabels = [...v]; },
    get currentAssignees() { return [...internal.modal.currentAssignees]; },
    set currentAssignees(v) { internal.modal.currentAssignees = [...v]; },
    get mainAssignee() { return internal.modal.mainAssignee; },
    set mainAssignee(v) { internal.modal.mainAssignee = v; },
    get currentChildTasks() { return internal.modal.currentChildTasks; },
    set currentChildTasks(v) { internal.modal.currentChildTasks = v; },
    get editingTicketId() { return internal.modal.editingTicketId; },
    set editingTicketId(v) { internal.modal.editingTicketId = v; },
    get newTicketColumn() { return internal.modal.newTicketColumn; },
    set newTicketColumn(v) { internal.modal.newTicketColumn = v; },
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
    set labelSuggestions(v) { internal.suggestions.labels = [...v]; },
    get assigneeSuggestions() { return [...internal.suggestions.assignees]; },
    set assigneeSuggestions(v) { internal.suggestions.assignees = [...v]; },
    get searchKeyword() { return internal.filter.keyword; },
    set searchKeyword(v) { internal.filter.keyword = v; },
    get mainAssigneeOnly() { return internal.filter.mainOnly; },
    set mainAssigneeOnly(v) { internal.filter.mainOnly = v; },
    get graphPanelOpen() { return internal.ui.graphPanelOpen; },
    set graphPanelOpen(v) { internal.ui.graphPanelOpen = v; },
    get ticketLocked() { return internal.ui.ticketLocked; },
    set ticketLocked(v) { internal.ui.ticketLocked = v; }
};

export const state = backwardCompatState;

// 後方互換用 filterState
export const filterState = {
    get assignee() { return internal.filter.assignee; },
    set assignee(v) { internal.filter.assignee = v; },
    get mainOnly() { return internal.filter.mainOnly; },
    set mainOnly(v) { internal.filter.mainOnly = v; },
    get keyword() { return internal.filter.keyword; },
    set keyword(v) { internal.filter.keyword = v; }
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
export function getSettings() {
    if (typeof window.Settings !== 'undefined' && window.Settings.settings) {
        return window.Settings.settings();
    }
    return { users: [], labels: [], holidays: [] };
}

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

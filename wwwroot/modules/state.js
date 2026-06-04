/**
 * アプリケーションの状態管理
 * 全モジュールから共有されるデータを一元管理
 */

// APIベースURL
export const API_BASE = '/api/tickets';

// グローバル状態
export const state = {
    ticketCounter: 0,
    currentLabels: [],
    currentAssignees: [],
    mainAssignee: null,
    currentChildTasks: [],
    editingTicketId: null,
    currentTicketData: {},
    allTickets: [],
    labelSuggestions: [],
    assigneeSuggestions: [],
    searchKeyword: '',
    // メイン担当限定フィルター
    mainAssigneeOnly: false,
    // グラフパネル表示状態
    graphPanelOpen: false,
};

// イベントバス（モジュール間通信用）
const eventListeners = {};

export function on(event, callback) {
    if (!eventListeners[event]) {
        eventListeners[event] = [];
    }
    eventListeners[event].push(callback);
}

export function emit(event, data) {
    if (eventListeners[event]) {
        eventListeners[event].forEach(cb => cb(data));
    }
}

/**
 * チケットデータを初期化
 */
export function initTicketData(tickets) {
    state.allTickets = tickets;
    state.currentTicketData = {};
    tickets.forEach(ticket => {
        state.currentTicketData[ticket.ticketId] = ticket;
        if (parseInt(ticket.id) > state.ticketCounter) {
            state.ticketCounter = parseInt(ticket.id);
        }
    });
}

/**
 * 単一チケットデータを更新
 */
export function updateTicketData(ticket) {
    state.currentTicketData[ticket.ticketId] = ticket;
    const idx = state.allTickets.findIndex(t => t.ticketId === ticket.ticketId);
    if (idx !== -1) {
        state.allTickets[idx] = ticket;
    }
}

/**
 * チケットを追加
 */
export function addTicket(ticket) {
    state.currentTicketData[ticket.ticketId] = ticket;
    state.allTickets.push(ticket);
}

/**
 * HTMLエスケープ（null/undefined 安全）
 */
export function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * 日付を「月日(曜日)」形式に変換（null安全）
 */
export function formatDateWithDay(date) {
    if (!date) return '';
    let d;
    try {
        d = new Date(date);
        if (isNaN(d.getTime())) return '';
    } catch {
        return '';
    }
    const months = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const month = months[d.getMonth()];
    const day = d.getDate();
    const weekday = days[d.getDay()];
    return `${month}${day}(${weekday})`;
}

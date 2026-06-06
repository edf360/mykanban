/**
 * チケットサービス層
 * API通信と状態更新の責務をモジュールから分離
 */

import { API_BASE, setTicket, addTicket } from './state.js';
import { apiRequest } from './api.js';
import { recreateTicket, renderAllTickets } from './renderer.js';

/**
 * 新規チケットを作成
 */
export async function createTicket(data) {
    data.column = data.column || 'todo';
    const created = await apiRequest('POST', API_BASE, data);
    addTicket(created);
    renderAllTickets();
    return created;
}

/**
 * 既存チケットを更新
 */
export async function updateTicket(ticketId, data) {
    const updated = await apiRequest('PUT', `${API_BASE}/${ticketId}`, data);
    setTicket(ticketId, updated);
    
    // DOM部分更新
    const ticketEl = document.querySelector(`.ticket[data-id="${ticketId}"]`);
    if (ticketEl) {
        const column = ticketEl.closest('.column');
        recreateTicket(ticketEl, updated, column);
    }
    
    return updated;
}

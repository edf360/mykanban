/**
 * チケットサービス層
 * API通信と状態更新の責務をモジュールから分離
 */

import { API_BASE, setTicket, addTicket } from './state.js';
import { apiRequest } from './api.js';

/**
 * 新規チケットを作成
 */
export async function createTicket(data) {
    data.column = data.column || 'todo';
    const created = await apiRequest('POST', API_BASE, data);
    addTicket(created);
    // 描画はSignalR通知に任せる
    return created;
}

/**
 * 既存チケットを更新
 */
export async function updateTicket(ticketId, data) {
    const updated = await apiRequest('PUT', `${API_BASE}/${ticketId}`, data);
    setTicket(ticketId, updated);
    // 描画はSignalR通知に任せる
    return updated;
}

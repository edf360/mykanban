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

/**
 * 担当者ごとに複数のチケットを生成
 * baseData: 共通のチケットデータ（assignees/mainAssigneeは含まない、isLockedは継承）
 */
export async function createTicketsPerAssignee(baseData, assignees) {
    const created = [];
    for (const assignee of assignees) {
        const ticketData = {
            ...baseData,
            assignees: [assignee],
            mainAssignee: assignee,
            column: baseData.column || 'todo',
        };
        const result = await apiRequest('POST', API_BASE, ticketData);
        addTicket(result);
        created.push(result);
    }
    // 描画はSignalR通知に任せる
    return created;
}

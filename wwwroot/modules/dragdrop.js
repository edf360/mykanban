/**
 * ドラッグ＆ドロップ処理モジュール
 */

import { API_BASE, state } from './state.js';
import { apiRequest, loadTickets } from './api.js';
import { draggedTicket, removeDropIndicators, updateColumnCount, renderAllTickets } from './renderer.js';

/**
 * ドロップゾーンを設定
 */
export function setupDropZones() {
    const ticketLists = document.querySelectorAll('.ticket-list');
    
    ticketLists.forEach(list => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            removeDropIndicators();
            
            const tickets = Array.from(list.querySelectorAll('.ticket:not(.dragging)'));
            const listRect = list.getBoundingClientRect();
            
            let insertIndex = -1;
            for (let i = 0; i < tickets.length; i++) {
                const ticketRect = tickets[i].getBoundingClientRect();
                const midY = ticketRect.top + ticketRect.height / 2;
                if (e.clientY < midY) {
                    insertIndex = i;
                    break;
                }
            }
            
            const indicator = document.createElement('div');
            indicator.className = 'drop-indicator';
            
            let topPosition;
            if (insertIndex === -1 || insertIndex >= tickets.length) {
                const lastTicket = tickets[tickets.length - 1];
                if (lastTicket) {
                    const lastRect = lastTicket.getBoundingClientRect();
                    topPosition = lastRect.bottom - listRect.top + 6;
                } else {
                    topPosition = 16;
                }
            } else {
                const ticketRect = tickets[insertIndex].getBoundingClientRect();
                topPosition = ticketRect.top - listRect.top - 6;
            }
            
            indicator.style.top = `${topPosition}px`;
            list.appendChild(indicator);
        });

        list.addEventListener('dragleave', () => {
            removeDropIndicators();
        });

        list.addEventListener('drop', async (e) => {
            e.preventDefault();
            removeDropIndicators();
            
            if (!draggedTicket) return;
            
            const tickets = Array.from(list.querySelectorAll('.ticket:not(.dragging)'));
            
            let insertIndex = -1;
            for (let i = 0; i < tickets.length; i++) {
                const ticketRect = tickets[i].getBoundingClientRect();
                const midY = ticketRect.top + ticketRect.height / 2;
                if (e.clientY < midY) {
                    insertIndex = i;
                    break;
                }
            }
            
            if (insertIndex === -1 || insertIndex > tickets.length - 1) {
                const lastTicket = tickets[tickets.length - 1];
                if (lastTicket) {
                    list.insertBefore(draggedTicket, lastTicket.nextSibling);
                } else {
                    list.appendChild(draggedTicket);
                }
            } else {
                list.insertBefore(draggedTicket, tickets[insertIndex]);
            }
            
            const column = list.closest('.column');
            updateColumnCount(column);
            
            // サーバーにカラム変更を通知
            const newColumn = column.dataset.column;
            const ticketId = draggedTicket.dataset.id;
            try {
                // ドロップ先のカラム内のチケット（ドラッグ中のは除く）を取得
                const otherTickets = tickets.filter(t => t.dataset.id !== ticketId);
                
                // InsertIndexを計算（otherTickets内の挿入位置）
                let insertIdx;
                if (otherTickets.length === 0) {
                    // カラムが空の場合
                    insertIdx = 0;
                } else if (insertIndex === -1 || insertIndex >= tickets.length) {
                    // 末尾に挿入
                    insertIdx = otherTickets.length;
                } else if (insertIndex === 0) {
                    // 先頭に挿入
                    insertIdx = 0;
                } else {
                    // 中間に挿入
                    insertIdx = insertIndex > otherTickets.length ? otherTickets.length : insertIndex;
                }
                
                const idx = state.allTickets.findIndex(t => t.ticketId === ticketId);
                if (idx !== -1) {
                    const wasArchived = state.allTickets[idx].isArchived;
                    const isNowArchived = newColumn === 'archive';
                    
                    if (wasArchived && !isNowArchived) {
                        await apiRequest('PATCH', `${API_BASE}/${ticketId}/restore`, null);
                        state.allTickets[idx].isArchived = false;
                    } else if (!wasArchived && isNowArchived) {
                        // DELETE APIはNoContentを返すため、ローカルでisArchivedを設定
                        await apiRequest('DELETE', `${API_BASE}/${ticketId}`, null);
                        state.allTickets[idx].isArchived = true;
                    }
                    
                    state.allTickets[idx].column = newColumn;
                }
                
                // サーバー側で中間値を計算してもらうためにインデックスを送信
                await apiRequest('PATCH', `${API_BASE}/${ticketId}/column`, { column: newColumn, insertIndex: insertIdx });
                
                // サーバーから最新のチケットデータを取得してから再描画
                await loadTickets();
                renderAllTickets();
            } catch (error) {
                console.error('Failed to update column:', error);
            }
        });
    });
}

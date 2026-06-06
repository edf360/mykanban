/**
 * ドラッグ＆ドロップ処理モジュール
 */

import { API_BASE, state } from './state.js';
import { apiRequest, loadTickets } from './api.js';
import { draggedTicket, removeDropIndicators, renderAllTickets, ticketMatchesFilter } from './renderer.js';

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
            
            // サーバーにカラム変更を通知
            const newColumn = list.closest('.column').dataset.column;
            const ticketId = draggedTicket.dataset.id;
            try {
                // state.allTicketsからドロップ先カラムの全チケットを取得（ドラッグ中除外）
                const allColumnTickets = state.allTickets
                    .filter(t => t.column === newColumn && t.ticketId !== ticketId)
                    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
                
                // フィルター後のチケットリスト（DOM上に表示されているものと同じ順序）
                const filteredColumnTickets = allColumnTickets.filter(t => ticketMatchesFilter(t));
                
                // insertIndexはDOM上（フィルター後）のインデックス
                // これをサーバー上の全チケットでの正しいインデックスに変換
                let insertIdx;
                if (allColumnTickets.length === 0) {
                    // カラムが空の場合
                    insertIdx = 0;
                } else if (insertIndex === -1 || insertIndex >= tickets.length) {
                    // 末尾に挿入
                    insertIdx = allColumnTickets.length;
                } else if (insertIndex === 0) {
                    // 先頭に挿入
                    insertIdx = 0;
                } else {
                    // 中間に挿入: フィルター後のinsertIndexに対応するチケットを特定し、
                    // それが全チケットリストで何番目かを確認
                    const targetTicket = filteredColumnTickets[insertIndex];
                    if (targetTicket) {
                        // 挿入位置の直後のチケット（フィルター後）が全チケットで何番目か
                        insertIdx = allColumnTickets.findIndex(t => t.ticketId === targetTicket.ticketId);
                        if (insertIdx === -1) insertIdx = allColumnTickets.length;
                    } else {
                        // insertIndexがfilteredColumnTicketsの範囲外の場合
                        insertIdx = allColumnTickets.length;
                    }
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

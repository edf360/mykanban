/**
 * ドラッグ＆ドロップ処理モジュール
 */

import { API_BASE, state, getAllTickets, getTicket, updateTicketField } from './state.js';
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

        list.addEventListener('dragleave', (e) => {
            if (!list.contains(e.relatedTarget)) {
                removeDropIndicators();
            }
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
                const allTickets = getAllTickets();
                // ドロップ先カラムの全チケットを取得（ドラッグ中除外）
                const allColumnTickets = allTickets
                    .filter(t => t.column === newColumn && String(t.ticketId) !== ticketId)
                    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

                // ドロップ後のDOMから可視チケット順を取得
                const visibleTickets = Array.from(
                    list.querySelectorAll('.ticket')
                );
                const visibleIndex = visibleTickets.findIndex(
                    t => t.dataset.id === ticketId
                );

                // insertIdxをDOMベースで計算
                let insertIdx;
                if (allColumnTickets.length === 0) {
                    insertIdx = 0;
                } else if (visibleIndex === -1) {
                    // ドロップしたチケットがDOMにない場合は末尾
                    insertIdx = allColumnTickets.length;
                } else {
                    const nextVisible = visibleTickets[visibleIndex + 1];
                    if (!nextVisible) {
                        // 末尾にドロップ
                        insertIdx = allColumnTickets.length;
                    } else {
                        // 次に来る可視チケットが全チケットリストで何番目か
                        insertIdx = allColumnTickets.findIndex(
                            t => String(t.ticketId) === nextVisible.dataset.id
                        );
                        if (insertIdx === -1) {
                            insertIdx = allColumnTickets.length;
                        }
                    }
                }

                const ticket = getTicket(ticketId);
                if (ticket) {
                    const wasArchived = ticket.isArchived;
                    const isNowArchived = newColumn === 'archive';
                    
                    if (wasArchived && !isNowArchived) {
                        await apiRequest('PATCH', `${API_BASE}/${ticketId}/restore`, null);
                        updateTicketField(ticketId, 'isArchived', false);
                    } else if (!wasArchived && isNowArchived) {
                        // DELETE APIはNoContentを返すため、ローカルでisArchivedを設定
                        await apiRequest('DELETE', `${API_BASE}/${ticketId}`, null);
                        updateTicketField(ticketId, 'isArchived', true);
                    }
                    
                    updateTicketField(ticketId, 'column', newColumn);
                }
                
                // サーバー側で中間値を計算してもらうためにインデックスを送信
                await apiRequest('PATCH', `${API_BASE}/${ticketId}/column`, { column: newColumn, insertIndex: insertIdx });
                
                // サーバーから最新のチケットデータを取得してから再描画
                await loadTickets();
                renderAllTickets();
            } catch (error) {
                console.error('Failed to update column:', error);
                await loadTickets();
                renderAllTickets();
            }
        });
    });
}

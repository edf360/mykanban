/**
 * 履歴表示モジュール
 */

import { API_BASE, escapeHtml } from './state.js';
import { apiRequest } from './api.js';

/**
 * 履歴を取得して表示
 */
export async function showHistory(ticketId) {
    try {
        const histories = await apiRequest('GET', `${API_BASE}/${ticketId}/history`, null);
        const historyListEl = document.getElementById('historyList');
        const historyModal = document.getElementById('historyModal');
        
        if (!historyListEl || !historyModal) {
            console.error('[showHistory] Required DOM elements not found');
            return;
        }
        
        if (!histories || histories.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'history-empty';
            emptyDiv.textContent = '履歴はありません';
            historyListEl.appendChild(emptyDiv);
        } else {
            historyListEl.innerHTML = '';
            
            // 日付順にグループ化
            const grouped = {};
            for (const h of histories) {
                if (!h.date) continue;
                const dateKey = h.date.split('T')[0];
                if (!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(h);
            }
            
            const typeLabels = {
                created: '作成',
                progress: '進捗',
                column: '移動',
                assignee: '担当者'
            };

            for (const [date, items] of Object.entries(grouped)) {
                const dateDiv = document.createElement('div');
                dateDiv.className = 'history-date';
                dateDiv.style.marginBottom = '4px';
                dateDiv.style.marginTop = '8px';
                dateDiv.style.fontWeight = '600';
                dateDiv.textContent = date;
                historyListEl.appendChild(dateDiv);
                
                for (const item of items) {
                    const div = document.createElement('div');
                    div.className = 'history-item';
                    
                    const typeLabel = typeLabels[item.type] || escapeHtml(String(item.type));
                    let detail = '';
                    
                    if (item.type === 'created') {
                        detail = 'チケットが作成されました';
                    } else if (item.type === 'progress') {
                        const prevVal = item.previousValue != null ? item.previousValue : '-';
                        const newVal = item.value != null ? item.value : '-';
                        detail = `進捗を ${prevVal}% → ${newVal}% に変更`;
                    } else if (item.type === 'column') {
                        const columnNames = { todo: 'To Do', doing: 'Doing', done: 'Done', archive: 'Archive' };
                        const from = item.previousValue ? (columnNames[item.previousValue] || escapeHtml(String(item.previousValue))) : '-';
                        const to = item.value ? (columnNames[item.value] || escapeHtml(String(item.value))) : '-';
                        detail = `${from} → ${to} に移動`;
                    } else if (item.type === 'assignee') {
                        try {
                            const oldList = JSON.parse(item.previousValue || '[]');
                            const newList = JSON.parse(item.value || '[]');
                            detail = `担当者: [${oldList.join(', ')}] → [${newList.join(', ')}]`;
                        } catch {
                            detail = `担当者が変更されました`;
                        }
                    }
                    
                    const typeSpan = document.createElement('span');
                    typeSpan.className = `history-type ${escapeHtml(String(item.type))}`;
                    typeSpan.textContent = typeLabel;
                    
                    const detailSpan = document.createElement('span');
                    detailSpan.className = 'history-detail';
                    detailSpan.textContent = detail;
                    
                    div.appendChild(typeSpan);
                    div.appendChild(detailSpan);
                    historyListEl.appendChild(div);
                }
            }
        }
        
        historyModal.classList.add('active');
    } catch (error) {
        console.error('Failed to load history:', error);
        const historyListEl = document.getElementById('historyList');
        const historyModal = document.getElementById('historyModal');
        if (historyListEl) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'history-empty';
            emptyDiv.textContent = '履歴の読み込みに失敗しました';
            historyListEl.appendChild(emptyDiv);
        }
        if (historyModal) {
            historyModal.classList.add('active');
        }
    }
}

/**
 * 履歴ダイアログを初期化（イベントリスナー設定）
 */
export function initHistory() {
    const historyModal = document.getElementById('historyModal');
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');

    viewHistoryBtn.addEventListener('click', () => {
        if (window.__editingTicketId) {
            showHistory(window.__editingTicketId);
        }
    });

    closeHistoryBtn.addEventListener('click', () => {
        historyModal.classList.remove('active');
    });

    historyModal.addEventListener('click', (e) => {
        if (e.target.id === 'historyModal') {
            historyModal.classList.remove('active');
        }
    });
}

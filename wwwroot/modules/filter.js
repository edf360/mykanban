/**
 * フィルター機能モジュール
 */

import { state } from './state.js';
import { renderAllTickets } from './renderer.js';

/**
 * 担当者フィルターをpopulate
 */
export function populateAssigneeFilter() {
    const select = document.getElementById('assigneeFilterSelect');
    if (!select) {
        console.warn('[populateAssigneeFilter] assigneeFilterSelect element not found');
        return;
    }
    select.innerHTML = '<option value="">すべて</option>';
    (state.assigneeSuggestions || []).forEach(assignee => {
        const option = document.createElement('option');
        option.value = assignee;
        option.textContent = assignee;
        select.appendChild(option);
    });
}

/**
 * フィルター機能を初期化
 */
export async function initFilter() {
    const assigneeSelect = document.getElementById('assigneeFilterSelect');
    
    if (assigneeSelect) {
        assigneeSelect.addEventListener('change', () => {
            renderAllTickets();
            // メモカラム更新（memo.jsから）
            if (typeof window.updateMemoColumn === 'function') {
                window.updateMemoColumn();
            }
        });
    }
}

/**
 * タイトル検索機能を初期化
 */
export function initTitleSearch() {
    const searchInput = document.getElementById('titleSearchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            state.searchKeyword = searchInput.value;
            renderAllTickets();
        });
    }
}

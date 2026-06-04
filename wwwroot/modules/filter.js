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
    const mainAssigneeCheckbox = document.getElementById('mainAssigneeOnlyCheckbox');
    
    if (assigneeSelect) {
        assigneeSelect.addEventListener('change', () => {
            // 担当者が選択されていない場合はメイン担当限定を無効化
            if (!assigneeSelect.value && mainAssigneeCheckbox) {
                mainAssigneeCheckbox.checked = false;
                state.mainAssigneeOnly = false;
                mainAssigneeCheckbox.disabled = true;
            } else if (assigneeSelect.value && mainAssigneeCheckbox) {
                mainAssigneeCheckbox.disabled = false;
            }
            renderAllTickets();
            // メモカラム更新（memo.jsから）
            if (typeof window.updateMemoColumn === 'function') {
                window.updateMemoColumn();
            }
        });
        // 初期状態：担当者が選択されていないので無効化
        if (mainAssigneeCheckbox) {
            mainAssigneeCheckbox.disabled = true;
        }
    }
}

/**
 * チケット検索機能を初期化（タイトル・メモ・子タスク名を検索対象）
 */
export function initTicketSearch() {
    const searchInput = document.getElementById('titleSearchInput');
    
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            state.searchKeyword = searchInput.value;
            renderAllTickets();
        });
    }
}

/**
 * メイン担当限定フィルターを初期化
 */
export function initMainAssigneeFilter() {
    const checkbox = document.getElementById('mainAssigneeOnlyCheckbox');
    
    if (checkbox) {
        checkbox.addEventListener('change', () => {
            state.mainAssigneeOnly = checkbox.checked;
            renderAllTickets();
        });
    }
}

/**
 * 検索ウィンドウの表示/非表示をトグル
 */
export function initFilterToggle() {
    const toggleBtn = document.getElementById('filterToggleBtn');
    const filterArea = document.getElementById('filterArea');
    
    if (!toggleBtn || !filterArea) return;
    
    // デフォルトは表示（active状態）
    toggleBtn.classList.add('active');
    
    toggleBtn.addEventListener('click', () => {
        filterArea.classList.toggle('hidden');
        toggleBtn.classList.toggle('active');
    });
}

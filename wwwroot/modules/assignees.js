/**
 * 担当者管理モジュール
 */

import { API_BASE, state, escapeHtml } from './state.js';
import { apiRequest } from './api.js';
import { recreateTicket } from './renderer.js';

/**
 * 担当者を追加
 */
export function addAssignee(text) {
    if (text.trim() && !state.currentAssignees.includes(text.trim())) {
        state.currentAssignees.push(text.trim());
        // メイン担当者が未設定の場合は自動的にメインに設定
        if (!state.mainAssignee) {
            state.mainAssignee = text.trim();
        }
        renderAssigneeTags();
    }
}

/**
 * 担当者を削除
 */
export function removeAssignee(index) {
    const removed = state.currentAssignees[index];
    state.currentAssignees.splice(index, 1);
    // メイン担当者が削除された場合はnullにリセット
    if (state.mainAssignee === removed) {
        state.mainAssignee = state.currentAssignees[0] || null;
    }
    renderAssigneeTags();
}

/**
 * 担当者タグを再描画（メイン担当者に冠アイコン）
 * タグクリックでメイン担当者を切り替え
 */
export function renderAssigneeTags() {
    const assigneeTagsEl = document.getElementById('assigneeTags');
    assigneeTagsEl.innerHTML = '';
    state.currentAssignees.forEach((assignee, i) => {
        const isMain = assignee === state.mainAssignee;
        const crownIcon = isMain ? '👑 ' : '';
        assigneeTagsEl.innerHTML += `<span class="assignee-tag ${isMain ? 'main' : ''}" data-assignee="${escapeHtml(assignee)}" title="クリックでメイン担当者に設定">${crownIcon}${escapeHtml(assignee)} <span class="remove-assignee" data-index="${i}">&times;</span></span>`;
    });
    
    // 担当者タグのクリックイベントをバインド（メイン担当者切り替え）
    assigneeTagsEl.querySelectorAll('.assignee-tag').forEach(tag => {
        tag.addEventListener('click', (e) => {
            // ×ボタンクリックの場合は担当者を削除
            if (e.target.classList.contains('remove-assignee')) {
                e.stopPropagation();
                const index = parseInt(e.target.dataset.index);
                removeAssignee(index);
                renderAssigneeSelect();
                return;
            }
            const clickedAssignee = e.currentTarget.dataset.assignee;
            state.mainAssignee = clickedAssignee;
            renderAssigneeTags();
        });
    });
}

/**
 * 担当者選択ドロップダウンを描画（設定から取得した一覧）
 */
export function renderAssigneeSelect() {
    const listEl = document.getElementById('assigneeList');
    const toggleBtn = document.getElementById('assigneeToggleBtn');
    if (!listEl || !toggleBtn) return;
    
    // ドロップダウンを閉じる
    listEl.classList.remove('active');
    
    listEl.innerHTML = '';
    
    const allAssignees = state.assigneeSuggestions || [];
    const currentAssignees = state.currentAssignees || [];
    
    allAssignees.forEach(assignee => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const isSelected = currentAssignees.includes(assignee);
        if (isSelected) {
            item.classList.add('selected');
        }
        
        item.innerHTML = `<span class="dropdown-checkmark">✓</span>${escapeHtml(assignee)}`;
        
        // アイテムクリックで担当者をトグル
        item.addEventListener('click', () => {
            toggleAssignee(assignee);
            renderAssigneeTags();
            renderAssigneeSelect();
        });
        
        listEl.appendChild(item);
    });
    
    // ボタンクリックでドロップダウン表示/非表示
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        listEl.classList.toggle('active');
    };
}

/**
 * 担当者をトグル
 */
function toggleAssignee(assignee) {
    const idx = state.currentAssignees.indexOf(assignee);

    if (idx >= 0) {
        state.currentAssignees.splice(idx, 1);

        if (state.mainAssignee === assignee) {
            state.mainAssignee = state.currentAssignees[0] || null;
        }
    } else {
        state.currentAssignees.push(assignee);

        if (!state.mainAssignee) {
            state.mainAssignee = assignee;
        }
    }
}

/**
 * ドロップダウンの変更から担当者配列を更新（後方互換用）
 */
export function syncAssigneesFromSelect() {
    // カスタムドロップダウンでは直接使用しないが、後方互換のため残す
}


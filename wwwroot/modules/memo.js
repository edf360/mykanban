/**
 * メモ機能モジュール（LocalStorageベース）
 */

import { renderAssigneeChart } from './charts.js';

/**
 * 担当者のメモを取得
 */
function getAssigneeMemo(assignee) {
    try {
        return localStorage.getItem(`assignee_memo_${assignee}`) || '';
    } catch (e) {
        return '';
    }
}

/**
 * 担当者のメモを保存
 */
function saveAssigneeMemo(assignee, memo) {
    try {
        localStorage.setItem(`assignee_memo_${assignee}`, memo);
    } catch (e) {
        console.error('Failed to save memo:', e);
    }
}

/**
 * 現在選択されているフィルター値を取得
 */
function getSelectedAssignee() {
    const select = document.getElementById('assigneeFilterSelect');
    return select ? select.value : '';
}

/**
 * メモカラムを更新（表示/非表示）
 */
export function updateMemoColumn() {
    const memoColumn = document.getElementById('memoColumn');
    const memoColumnTitle = document.getElementById('memoColumnTitle');
    const assigneeMemoText = document.getElementById('assigneeMemoText');
    
    if (!memoColumn || !assigneeMemoText) return;
    
    const selectedAssignee = getSelectedAssignee();
    if (!selectedAssignee) {
        memoColumn.style.display = 'none';
        return;
    }
    
    assigneeMemoText.value = getAssigneeMemo(selectedAssignee);
    if (memoColumnTitle) {
        memoColumnTitle.textContent = `${selectedAssignee} - Memo`;
    }
    memoColumn.style.display = 'flex';
    
    // 予実グラフを描画
    const chartContainer = document.getElementById('assigneeChart');
    if (chartContainer) {
        renderAssigneeChart(chartContainer, selectedAssignee);
    }
}

/**
 * メモ機能を初期化
 */
export function initMemo() {
    const assigneeMemoText = document.getElementById('assigneeMemoText');
    
    if (!assigneeMemoText) {
        console.warn('Memo textarea not found');
        return;
    }
    
    // メモテキスト変更時に自動保存（デバウンス）
    let memoSaveTimeout = null;
    assigneeMemoText.addEventListener('input', () => {
        const selectedAssignee = getSelectedAssignee();
        if (!selectedAssignee) return;
        clearTimeout(memoSaveTimeout);
        memoSaveTimeout = setTimeout(() => {
            saveAssigneeMemo(selectedAssignee, assigneeMemoText.value);
        }, 300);
    });
    
    // グローバルに公開（filter.jsから呼び出し用）
    window.updateMemoColumn = updateMemoColumn;
}

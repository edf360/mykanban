/**
 * メモ機能モジュール（LocalStorageベース）
 */

import { getFilterAssignee } from './state.js';
import { renderAssigneeChart } from './charts.js';
import { getUsername } from './auth.js';

// ===== Storage層 =====

const MEMO_KEY_PREFIX = 'assignee_memo_';

/**
 * メモのストレージキーを生成（エンコード済み）
 */
function getMemoKey(assignee) {
    return `${MEMO_KEY_PREFIX}${encodeURIComponent(assignee)}`;
}

/**
 * 担当者のメモを取得
 */
export function getMemo(assignee) {
    try {
        return localStorage.getItem(getMemoKey(assignee)) || '';
    } catch {
        return '';
    }
}

/**
 * 担当者のメモを保存
 */
export function saveMemo(assignee, memo) {
    try {
        localStorage.setItem(getMemoKey(assignee), memo);
        return true;
    } catch (e) {
        console.error('Failed to save memo:', e);
        alert('メモの保存に失敗しました');
        return false;
    }
}

// ===== State層 =====

/**
 * 現在選択されている担当者を取得（filterState参照）
 */
function getSelectedAssignee() {
    return getFilterAssignee();
}

/**
 * 現在選択されている担当者がログインユーザー自身かどうかを判定
 */
function isSelfEditAllowed() {
    const selectedAssignee = getFilterAssignee();
    const loggedInUser = getUsername();
    return selectedAssignee !== null && selectedAssignee === loggedInUser;
}

// ===== UI層 =====

let memoSaveTimeout = null;
let memoInitialized = false;

/**
 * メモカラムを更新（表示/非表示・内容更新・グラフ描画）
 */
export function updateMemoColumn() {
    const memoColumn = document.getElementById('memoColumn');
    const memoColumnTitle = document.getElementById('memoColumnTitle');
    const assigneeMemoText = document.getElementById('assigneeMemoText');

    if (!memoColumn || !assigneeMemoText || !memoColumnTitle) return;

    const selectedAssignee = getSelectedAssignee();
    memoColumn.classList.toggle('hidden', !selectedAssignee);

    if (!selectedAssignee) return;

    assigneeMemoText.value = getMemo(selectedAssignee);
    memoColumnTitle.textContent = `${selectedAssignee} - Memo`;

    // ログインユーザー自身がフィルターで選択している場合のみ編集可能
    const canEdit = isSelfEditAllowed();
    assigneeMemoText.readOnly = !canEdit;
    assigneeMemoText.classList.toggle('memo-locked', !canEdit);

    // グラフ描画（担当者が変わった時のみ）
    const chartContainer = document.getElementById('assigneeChart');
    if (chartContainer) {
        renderAssigneeChart(chartContainer, selectedAssignee);
    }
}

/**
 * メモ機能を初期化（重複実行防止）
 */
export function initMemo() {
    if (memoInitialized) return;
    memoInitialized = true;

    const assigneeMemoText = document.getElementById('assigneeMemoText');
    if (!assigneeMemoText) {
        console.warn('Memo textarea not found');
        return;
    }

    // oninput上書きで重複登録防止（自分自身のみ編集可能）
    assigneeMemoText.oninput = () => {
        if (!isSelfEditAllowed()) return;
        const selectedAssignee = getSelectedAssignee();
        if (!selectedAssignee) return;
        clearTimeout(memoSaveTimeout);
        memoSaveTimeout = setTimeout(() => {
            saveMemo(selectedAssignee, assigneeMemoText.value);
        }, 300);
    };
}

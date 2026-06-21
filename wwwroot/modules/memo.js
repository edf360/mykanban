/**
 * メモ機能モジュール（DBベース）
 */

import { getFilterAssignee } from './state.js';
import { renderAssigneeChart } from './charts.js';
import { getUsername } from './auth.js';
import { loadUserSettings, saveUserSettings } from './userSettings.js';
import { getSettings as loadSettings, save as saveSettings } from './settings.js';

// ===== Storage層 =====

/**
 * 担当者のメモを取得（DBから）
 */
export async function getMemoFromDb(assignee) {
    try {
        const settings = loadSettings();
        return (settings?.memos?.[assignee] ?? '') || '';
    } catch {
        return '';
    }
}

/**
 * 担当者のメモをDBに保存
 */
export async function saveMemoToDb(assignee, memo) {
    try {
        const settings = loadSettings();
        if (!settings.memos) {
            settings.memos = {};
        }
        settings.memos[assignee] = memo;
        await saveSettings();
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
 * メモカラムの表示状態を保存
 */
function saveMemoVisibility(visible) {
    const settings = loadUserSettings();
    settings.memo = { visible };
    saveUserSettings(settings);
}

/**
 * メモカラムを更新（内容更新・グラフ描画）
 * 表示/非表示はトグルボタンで制御
 */
export async function updateMemoColumn() {
    const memoColumn = document.getElementById('memoColumn');
    const memoColumnTitle = document.getElementById('memoColumnTitle');
    const assigneeMemoText = document.getElementById('assigneeMemoText');

    if (!memoColumn || !assigneeMemoText || !memoColumnTitle) return;

    const selectedAssignee = getSelectedAssignee();
    if (!selectedAssignee) return;

    const memo = await getMemoFromDb(selectedAssignee);
    assigneeMemoText.value = memo;
    memoColumnTitle.textContent = `${selectedAssignee} - Memo`;

    // ログインユーザー自身がフィルターで選択している場合のみ編集可能
    const canEdit = isSelfEditAllowed();
    assigneeMemoText.readOnly = !canEdit;
    assigneeMemoText.classList.toggle('memo-locked', !canEdit);

    // グラフ描画
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

    const memoColumn = document.getElementById('memoColumn');
    const memoToggleBtn = document.getElementById('memoToggleBtn');
    const memoCloseBtn = document.getElementById('memoCloseBtn');
    const assigneeMemoText = document.getElementById('assigneeMemoText');

    if (!memoColumn || !assigneeMemoText) {
        console.warn('Memo elements not found');
        return;
    }

    // 保存された設定を復元
    const settings = loadUserSettings();
    if (settings.memo && settings.memo.visible) {
        memoColumn.classList.remove('hidden');
        if (memoToggleBtn) memoToggleBtn.classList.add('active');
    } else {
        memoColumn.classList.add('hidden');
        if (memoToggleBtn) memoToggleBtn.classList.remove('active');
    }

    // トグルボタン
    if (memoToggleBtn) {
        memoToggleBtn.addEventListener('click', () => {
            const isVisible = !memoColumn.classList.contains('hidden');
            memoColumn.classList.toggle('hidden');
            memoToggleBtn.classList.toggle('active');
            saveMemoVisibility(!isVisible);
        });
    }

    // ×ボタンでメモを閉じる
    if (memoCloseBtn) {
        memoCloseBtn.addEventListener('click', () => {
            memoColumn.classList.add('hidden');
            if (memoToggleBtn) memoToggleBtn.classList.remove('active');
            saveMemoVisibility(false);
        });
    }

    // oninput上書きで重複登録防止（自分自身のみ編集可能）
    assigneeMemoText.oninput = () => {
        if (!isSelfEditAllowed()) return;
        const selectedAssignee = getSelectedAssignee();
        if (!selectedAssignee) return;
        clearTimeout(memoSaveTimeout);
        memoSaveTimeout = setTimeout(async () => {
            await saveMemoToDb(selectedAssignee, assigneeMemoText.value);
        }, 300);
    };
}

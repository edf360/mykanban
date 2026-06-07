/**
 * モーダル操作モジュール
 */

import { state, setModalState, resetModalState, setTicketLocked, isTicketLocked, setTicketEmergency, isTicketEmergency, getTicket, getCurrentAssignees, getCurrentLabels, getMainAssignee, getChildTasks, getNewTicketColumn, getEditingTicketId, getFilterAssignee } from './state.js';
import { renderAssigneeTags, renderAssigneeSelect } from './assignees.js';
import { renderLabelSelect } from './labels.js';
import { renderChildTasks } from './childtasks.js';
import { createTicket, updateTicket } from './ticketService.js';

// ===== DOM要素キャッシュ =====
const el = {
    modal: null,
    modalContent: null,
    modalTitle: null,
    ticketTitle: null,
    startDate: null,
    endDate: null,
    effort: null,
    memo: null,
    assigneeTags: null,
    childTasks: null,
    cancelBtn: null,
    saveBtn: null,
    lockBtn: null,
    emergencyBtn: null,
};

/**
 * DOM要素をキャッシュ
 */
function cacheElements() {
    el.modal = document.getElementById('ticketModal');
    el.modalContent = el.modal ? el.modal.querySelector('.modal') : null;
    el.modalTitle = document.getElementById('modalTitle');
    el.ticketTitle = document.getElementById('ticketTitle');
    el.startDate = document.getElementById('startDate');
    el.endDate = document.getElementById('endDate');
    el.effort = document.getElementById('effort');
    el.memo = document.getElementById('memo');
    el.assigneeTags = document.getElementById('assigneeTags');
    el.childTasks = document.getElementById('childTasks');
    el.cancelBtn = document.getElementById('cancelBtn');
    el.saveBtn = document.getElementById('saveBtn');
    el.lockBtn = document.getElementById('modalLockBtn');
    el.emergencyBtn = document.getElementById('modalEmergencyBtn');
}

/**
 * 内部用モーダルオープン処理
 */
function _openModal(options) {
    // options: { mode: 'new'|'edit', column?: string, ticketId?: string }
    
    if (options.mode === 'new') {
        // 新規チケット状態
        resetModalState();
        setModalState({ newTicketColumn: options.column || 'todo' });
        setTicketLocked(false);
        setTicketEmergency(false);
        
        // フィルターで選択された担当者をデフォルトに設定（メイン担当も自動設定）
        const selectedAssignee = getFilterAssignee();
        if (selectedAssignee) {
            setModalState({ currentAssignees: [selectedAssignee], mainAssignee: selectedAssignee });
        }
        
        // DOM初期化
        if (el.modalTitle) el.modalTitle.textContent = '新しいチケット';
        if (el.ticketTitle) el.ticketTitle.value = '';
        if (el.startDate) el.startDate.value = '';
        if (el.endDate) el.endDate.value = '';
        if (el.effort) el.effort.value = '';
        if (el.memo) el.memo.value = '';
        if (el.assigneeTags) el.assigneeTags.innerHTML = '';
        if (el.childTasks) el.childTasks.innerHTML = '';
        
    } else if (options.mode === 'edit') {
        // 編集モード
        const data = getTicket(options.ticketId);
        if (!data) {
            console.warn('[Modal] No ticket data found for ticketId:', options.ticketId);
            return;
        }
        
        // メイン担当が未設定の場合は有効担当者の最初をメインに設定
        const mainAssignee = data.mainAssignee || (data.assignees && data.assignees.length > 0 ? data.assignees[0] : null);
        setModalState({
            editingTicketId: options.ticketId,
            currentLabels: data.labels ? [...data.labels] : [],
            currentAssignees: data.assignees ? [...data.assignees] : [],
            mainAssignee,
            currentChildTasks: data.childTasks ? data.childTasks.map(t => ({...t})) : []
        });
        setTicketLocked(data.isLocked || false);
        setTicketEmergency(data.isEmergency || false);
        
        // DOM更新
        if (el.modalTitle) el.modalTitle.textContent = 'チケットを編集';
        if (el.ticketTitle) el.ticketTitle.value = data.title || '';
        if (el.startDate) el.startDate.value = data.startDate ? data.startDate.substring(0, 10) : '';
        if (el.endDate) el.endDate.value = data.endDate ? data.endDate.substring(0, 10) : '';
        if (el.effort) el.effort.value = data.effort || '';
        if (el.memo) el.memo.value = data.memo || '';
    }
    
    // ロックUI更新
    updateLockButton();
    updateEmergencyButton();
    applyEmergencyToModal();
    applyLockToModal();
    
    // レンダリング
    renderAssigneeTags();
    renderAssigneeSelect();
    renderLabelSelect();
    
    if (options.mode === 'edit') {
        renderChildTasks();
    }
    
    // モーダル表示
    if (el.modal) {
        el.modal.classList.add('active');
    }
    
    // 新規作成時はタイトルにフォーカス
    if (options.mode === 'new') {
        setTimeout(() => {
            if (el.ticketTitle) {
                el.ticketTitle.focus();
                el.ticketTitle.select();
            }
        }, 350);
    }
}

/**
 * 新規チケットモーダルを開く（後方互換ラッパー）
 */
export function openNewModal(column) {
    _openModal({ mode: 'new', column });
}

/**
 * 既存チケットの編集モーダルを開く（後方互換ラッパー）
 */
export function openEditModal(ticketId) {
    _openModal({ mode: 'edit', ticketId });
}

/**
 * モーダルを閉じる
 */
export function closeModal() {
    if (!el.modal) return;
    el.modal.classList.remove('active');
    if (el.modalContent) {
        el.modalContent.classList.remove('locked');
    }
    setModalState({ editingTicketId: null });
}

/**
 * ロックボタンを更新（テキストアイコン）
 */
function updateLockButton() {
    if (el.lockBtn) {
        el.lockBtn.textContent = isTicketLocked() ? '🔒' : '🔓';
    }
}

/**
 * モーダルにロック状態を適用（フィールドをグレーアウト）
 */
function applyLockToModal() {
    if (!el.modalContent) return;
    
    if (isTicketLocked()) {
        el.modalContent.classList.add('locked');
    } else {
        el.modalContent.classList.remove('locked');
    }
}

/**
 * ロック/アンロックをトグル
 */
export function toggleLock() {
    setTicketLocked(!isTicketLocked());
    updateLockButton();
    applyLockToModal();
}

/**
 * 緊急ボタンを更新
 */
function updateEmergencyButton() {
    if (el.emergencyBtn) {
        el.emergencyBtn.textContent = isTicketEmergency() ? '🏃' : '🚶';
        el.emergencyBtn.classList.toggle('active', isTicketEmergency());
    }
}

/**
 * 緊急フラグをトグル
 */
export function toggleEmergency() {
    setTicketEmergency(!isTicketEmergency());
    updateEmergencyButton();
    applyEmergencyToModal();
}

/**
 * モーダルに緊急状態を適用（背景色変更）
 */
function applyEmergencyToModal() {
    if (!el.modalContent) return;
    el.modalContent.classList.toggle('emergency', isTicketEmergency());
}

/**
 * フォームからチケットデータを収集
 */
function collectFormData() {
    if (!el.ticketTitle) return null;
    const title = el.ticketTitle.value.trim();
    if (!title) {
        alert('タイトルを入力してください');
        return null;
    }
    
    const startDateVal = el.startDate ? el.startDate.value : '';
    const endDateVal = el.endDate ? el.endDate.value : '';
    const effortVal = el.effort ? el.effort.value : '';
    const memoVal = el.memo ? el.memo.value.trim() : '';
    
    const assignees = getCurrentAssignees();
    let mainAssignee = getMainAssignee();
    // 担当者がいるがメイン担当が未設定の場合は最初の担当者をメインに設定
    if (!mainAssignee && assignees.length > 0) {
        mainAssignee = assignees[0];
    }
    
    return {
        title,
        startDate: startDateVal || null,
        endDate: endDateVal || null,
        effort: parseInt(effortVal) || null,
        assignees,
        mainAssignee,
        labels: getCurrentLabels(),
        memo: memoVal,
        childTasks: getChildTasks().map(t => ({...t})),
        isLocked: isTicketLocked(),
        isEmergency: isTicketEmergency()
    };
}

/**
 * チケットを保存
 */
export async function saveTicket() {
    const data = collectFormData();
    if (!data) return;
    
    try {
        const editingId = getEditingTicketId();
        if (editingId) {
            await updateTicket(editingId, data);
        } else {
            data.column = getNewTicketColumn() || 'todo';
            await createTicket(data);
        }
    } catch (error) {
        console.error('Failed to save ticket:', error);
        alert('保存に失敗しました: ' + error.message);
        return;
    }
    
    closeModal();
}

/**
 * モーダル関連のイベントを初期化
 */
export function initModal() {
    cacheElements();
    
    if (!el.modal) return;
    
    if (el.cancelBtn) {
        el.cancelBtn.addEventListener('click', closeModal);
    }
    if (el.saveBtn) {
        el.saveBtn.addEventListener('click', saveTicket);
    }
    if (el.lockBtn) {
        el.lockBtn.addEventListener('click', toggleLock);
    }
    if (el.emergencyBtn) {
        el.emergencyBtn.addEventListener('click', toggleEmergency);
    }
    
    // モーダル外クリックで保存
    // テキスト選択ドラッグによる誤判定を防ぐため、mousedown/mouseup で判断
    let mouseDownOnOverlay = false;
    
    el.modal.addEventListener('mousedown', (e) => {
        // オーバーレイ（バックドロップ）上でマウスダウンした場合のみフラグを設定
        if (e.target.id === 'ticketModal') {
            mouseDownOnOverlay = true;
        }
    });
    
    el.modal.addEventListener('mouseup', (e) => {
        if (mouseDownOnOverlay && e.target.id === 'ticketModal') {
            // オーバーレイ上で mousedown と mouseup の両方があった場合のみ保存
            saveTicket();
        }
        mouseDownOnOverlay = false;
    });
}

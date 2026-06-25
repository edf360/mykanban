/**
 * モーダル操作モジュール
 */

// モーダルアニメーション完了までの待機時間（ms）
export const MODAL_ANIMATION_DURATION = 350;

import { state, setModalState, resetModalState, setTicketLocked, isTicketLocked, setTicketEmergency, isTicketEmergency, getTicket, getCurrentAssignees, getCurrentLabels, getMainAssignee, getChildTasks, getNewTicketColumn, getEditingTicketId, getFilterAssignee, getCurrentCategory, on, closeGraphPanel } from './state.js';
import { renderAssigneeTags, renderAssigneeSelect } from './assignees.js';
import { renderLabelSelect } from './labels.js';
import { renderChildTasks } from './childtasks.js';
import { createTicket, updateTicket, createTicketsPerAssignee } from './ticketService.js';
import { openActualModal } from './actual.js';

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
    hamburgerBtn: null,
    savePerAssigneeBtn: null,
    viewActualBtn: null,
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
    el.hamburgerBtn = document.getElementById('modalHamburgerBtn');
    el.savePerAssigneeBtn = document.getElementById('savePerAssigneeBtn');
    el.viewActualBtn = document.getElementById('viewActualBtn');
}

/**
 * 内部用モーダルオープン処理
 */
function _openModal(options) {
    // options: { mode: 'new'|'edit', column?: string, ticketId?: string }
    
    // グラフパネルが開いている場合は閉じる
    closeGraphPanel();
    
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
            currentChildTasks: data.childTasks ? data.childTasks.map(t => ({...t})) : [],
            currentCategory: data.category || ''
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
    updateHamburgerMenu();
    applyEmergencyToModal();
    applyLockToModal();
    
    // 担当者ごとに生成ボタンの表示/非表示（新規作成時のみ表示）
    updateSavePerAssigneeButton();
    
    // 実績登録ボタンの有効/無効（新規チケット時は無効）
    updateActualButton();
    
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
        }, MODAL_ANIMATION_DURATION);
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
 * ハンバーガーメニューを更新
 */
function updateHamburgerMenu() {
    // メニューの状態は動的に生成するのでここでは何もしない
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
    updateHamburgerMenu();
    applyLockToModal();
}


/**
 * 緊急フラグをトグル
 */
export function toggleEmergency() {
    setTicketEmergency(!isTicketEmergency());
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
 * カテゴリ入力ダイアログを開く
 */
export function openCategoryDialog() {
    const current = getCurrentCategory() || '';
    const input = prompt('集計カテゴリを入力してください', current);
    if (input !== null) {
        setModalState({ currentCategory: input.trim() });
    }
}

// ハンバーガーメニューのドキュメントイベントリスナー
let hamburgerDocListener = null;

/**
 * ハンバーガーメニューをトグル
 */
function toggleHamburgerMenu() {
    const menu = document.getElementById('modalHamburgerMenu');
    if (!menu) return;
    
    if (menu.classList.contains('active')) {
        closeHamburgerMenu();
    } else {
        openHamburgerMenu();
    }
}

function openHamburgerMenu() {
    const menu = document.getElementById('modalHamburgerMenu');
    if (!menu) return;
    
    // ロック状態を取得
    const locked = isTicketLocked();
    const isEdit = !!getEditingTicketId();
    const category = getCurrentCategory() || '(未設定)';
    
    menu.innerHTML = `
        <div class="modal-menu-item" data-action="lock">
            <span class="menu-icon">${isTicketLocked() ? '🔒' : '🔓'}</span>
            <span class="menu-label">編集ロック</span>
            <span class="menu-check">${isTicketLocked() ? '✓' : ''}</span>
        </div>
        <div class="modal-menu-item" data-action="emergency">
            <span class="menu-icon">🚨</span>
            <span class="menu-label">緊急チケット</span>
            <span class="menu-check">${isTicketEmergency() ? '✓' : ''}</span>
        </div>
        <div class="modal-menu-item${locked ? ' disabled' : ''}" data-action="category">
            <span class="menu-icon">🏷️</span>
            <span class="menu-label">集計カテゴリ: ${category}</span>
            <span class="menu-check"></span>
        </div>
        ${isEdit ? `
        <div class="modal-menu-item" data-action="details">
            <span class="menu-icon">📋</span>
            <span class="menu-label">詳細</span>
            <span class="menu-arrow">▶</span>
        </div>
        <div class="modal-menu-submenu" id="modalDetailsSubmenu"></div>
        ` : ''}
    `;
    
    menu.classList.add('active');
    
    // メニューアイテムのクリックイベント
    menu.querySelectorAll('.modal-menu-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = item.dataset.action;
            if (item.classList.contains('disabled')) return;
            
            if (action === 'details') {
                toggleDetailsSubmenu();
                return;
            }
            
            switch (action) {
                case 'lock':
                    toggleLock();
                    break;
                case 'emergency':
                    toggleEmergency();
                    break;
                case 'category':
                    openCategoryDialog();
                    break;
            }
            closeHamburgerMenu();
        });
    });
    
    // 外部クリックで閉じる
    hamburgerDocListener = (e) => {
        const btn = document.getElementById('modalHamburgerBtn');
        const menu = document.getElementById('modalHamburgerMenu');
        if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
            closeHamburgerMenu();
        }
    };
    document.addEventListener('click', hamburgerDocListener);
}

/**
 * 詳細サブメニューの展開/折りたたみをトグル
 */
function toggleDetailsSubmenu() {
    const submenu = document.getElementById('modalDetailsSubmenu');
    const detailsItem = document.querySelector('[data-action="details"]');
    if (!submenu) return;
    
    const arrow = detailsItem ? detailsItem.querySelector('.menu-arrow') : null;
    
    if (submenu.classList.contains('expanded')) {
        submenu.classList.remove('expanded');
        if (arrow) arrow.textContent = '▶';
    } else {
        const ticketId = getEditingTicketId();
        const data = ticketId ? getTicket(ticketId) : null;
        
        if (data) {
            submenu.innerHTML = `
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">チケットID</span>
                    <span class="detail-value">${data.ticketId || '-'}</span>
                </div>
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">内部ID</span>
                    <span class="detail-value">${data.id || '-'}</span>
                </div>
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">位置</span>
                    <span class="detail-value">${data.position ?? '-'}</span>
                </div>
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">カラム</span>
                    <span class="detail-value">${data.column || '-'}</span>
                </div>
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">進捗</span>
                    <span class="detail-value">${data.progress ?? '-'}%</span>
                </div>
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">前カラム</span>
                    <span class="detail-value">${data.previousColumn || '-'}</span>
                </div>
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">作成日</span>
                    <span class="detail-value">${data.createdAt ? new Date(data.createdAt).toLocaleString('ja-JP') : '-'}</span>
                </div>
            `;
        } else {
            submenu.innerHTML = `
                <div class="modal-menu-submenu-row">
                    <span class="detail-label">詳細情報なし</span>
                </div>
            `;
        }
        
        submenu.classList.add('expanded');
        if (arrow) arrow.textContent = '▼';
    }
}

function closeHamburgerMenu() {
    const menu = document.getElementById('modalHamburgerMenu');
    if (menu) {
        menu.classList.remove('active');
    }
    if (hamburgerDocListener) {
        document.removeEventListener('click', hamburgerDocListener);
        hamburgerDocListener = null;
    }
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
        isEmergency: isTicketEmergency(),
        category: getCurrentCategory()
    };
}

/**
 * チケットを保存
 */
export async function saveTicket() {
    let data = collectFormData();
    if (!data) return;
    
    // 集計カテゴリが空だったらタイトルをそのまま使用
    if (!data.category || data.category.trim() === '') {
        data.category = data.title;
    }

    // 子タスクの集計カテゴリが空だったら子タスク名をコピー
    data.childTasks = data.childTasks.map(task => {
        if (!task.category || task.category.trim() === '') {
            return { ...task, category: task.text };
        }
        return task;
    });
    
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
 * 担当者ごとに生成ボタンを更新
 * 新規作成時 + 担当者が2人以上の場合のみ有効
 */
function updateSavePerAssigneeButton() {
    if (!el.savePerAssigneeBtn) return;
    const isEdit = !!getEditingTicketId();
    const assignees = getCurrentAssignees();
    const canCreate = !isEdit && assignees.length >= 2;
    el.savePerAssigneeBtn.disabled = !canCreate;
}

/**
 * 実績登録ボタンの有効/無効を更新
 * 新規チケット時は無効、既存チケット編集時は有効
 */
function updateActualButton() {
    if (!el.viewActualBtn) return;
    const isEdit = !!getEditingTicketId();
    el.viewActualBtn.disabled = !isEdit;
}

/**
 * 担当者ごとにチケットを生成
 */
export async function saveTicketsPerAssignee() {
    const isEdit = !!getEditingTicketId();
    const assignees = getCurrentAssignees();
    if (isEdit || assignees.length < 2) return;
    
    let data = collectFormData();
    if (!data) return;
    
    // 集計カテゴリが空だったらタイトルをそのまま使用
    if (!data.category || data.category.trim() === '') {
        data.category = data.title;
    }

    // 子タスクの集計カテゴリが空だったら子タスク名をコピー
    data.childTasks = data.childTasks.map(task => {
        if (!task.category || task.category.trim() === '') {
            return { ...task, category: task.text };
        }
        return task;
    });
    
    try {
        const column = getNewTicketColumn() || 'todo';
        const baseData = {
            title: data.title,
            startDate: data.startDate,
            endDate: data.endDate,
            effort: data.effort,
            labels: data.labels,
            memo: data.memo,
            childTasks: data.childTasks,
            isLocked: data.isLocked,
            isEmergency: data.isEmergency,
            category: data.category,
            column,
        };
        await createTicketsPerAssignee(baseData, assignees);
    } catch (error) {
        console.error('Failed to create tickets per assignee:', error);
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
    if (el.hamburgerBtn) {
        el.hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHamburgerMenu();
        });
    }
    if (el.savePerAssigneeBtn) {
        el.savePerAssigneeBtn.addEventListener('click', saveTicketsPerAssignee);
    }
    if (el.viewActualBtn) {
        el.viewActualBtn.addEventListener('click', () => {
            const ticketId = getEditingTicketId();
            if (ticketId) {
                openActualModal(ticketId);
            }
        });
    }
    
    // 担当者変更時にボタンの状態を更新
    on('modal-changed', () => {
        updateSavePerAssigneeButton();
    });
    
    // キーボードショートカット（ESC=キャンセル、Enter=保存）
    el.modal.addEventListener('keydown', (e) => {
        // モーダルがアクティブな時のみ有効
        if (!el.modal.classList.contains('active')) return;
        
        // テキスト入力フィールド（textarea）での入力は許可
        const tagName = e.target.tagName;
        if (tagName === 'TEXTAREA') return;
        
        if (e.key === 'Escape') {
            // 履歴モーダルがアクティブな場合はチケット編集モーダルを閉じない
            const historyModal = document.getElementById('historyModal');
            if (historyModal && historyModal.classList.contains('active')) return;
            e.preventDefault();
            closeModal();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            saveTicket();
        }
    });
    
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

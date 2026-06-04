/**
 * モーダル操作モジュール
 */

import { API_BASE, state, escapeHtml } from './state.js';
import { apiRequest } from './api.js';
import { recreateTicket, renderAllTickets } from './renderer.js';
import { renderAssigneeTags, renderAssigneeSelect } from './assignees.js';
import { renderLabelSelect } from './labels.js';
import { addChildTaskToDom, renderChildTasks } from './childtasks.js';

/**
 * 新規チケットモーダルを開く
 */
export function openNewModal(defaultColumn) {
    console.log('[Modal] openNewModal called with defaultColumn:', defaultColumn);
    state.editingTicketId = null;
    window.__editingTicketId = null;
    state.currentLabels = [];
    state.currentAssignees = [];
    state.mainAssignee = null;
    state.currentChildTasks = [];
    state.newTicketColumn = defaultColumn || 'todo';
    
    // フィルターで選択された担当者をデフォルトに設定
    const selectedAssignee = getSelectedAssignee();
    state.currentAssignees = selectedAssignee ? [selectedAssignee] : [];
    
    document.getElementById('modalTitle').textContent = '新しいチケット';
    document.getElementById('ticketTitle').value = '';
    document.getElementById('startDate').value = '';
    document.getElementById('endDate').value = '';
    document.getElementById('effort').value = '';
    document.getElementById('memo').value = '';
    document.getElementById('assigneeTags').innerHTML = '';
    document.getElementById('childTasks').innerHTML = '';
    
    renderAssigneeTags();
    renderAssigneeSelect();
    renderLabelSelect();
    
    const modal = document.getElementById('ticketModal');
    console.log('[Modal] ticketModal element:', modal);
    modal.classList.add('active');
    console.log('[Modal] modal active class added, visible:', modal.classList.contains('active'));
}

/**
 * 既存チケットの編集モーダルを開く
 */
export function openEditModal(ticketId) {
    console.log('[Modal] openEditModal called with ticketId:', ticketId);
    state.editingTicketId = ticketId;
    window.__editingTicketId = ticketId;
    const data = state.currentTicketData[ticketId];
    console.log('[Modal] ticket data from state.currentTicketData:', data);
    if (!data) {
        console.warn('[Modal] No ticket data found for ticketId:', ticketId);
        return;
    }
    
    state.currentLabels = data.labels ? [...data.labels] : [];
    state.currentAssignees = data.assignees ? [...data.assignees] : [];
    state.mainAssignee = data.mainAssignee || null;
    state.currentChildTasks = data.childTasks ? data.childTasks.map(t => ({...t})) : [];
    
    document.getElementById('modalTitle').textContent = 'チケットを編集';
    document.getElementById('ticketTitle').value = data.title || '';
    document.getElementById('startDate').value = data.startDate ? data.startDate.substring(0, 10) : '';
    document.getElementById('endDate').value = data.endDate ? data.endDate.substring(0, 10) : '';
    document.getElementById('effort').value = data.effort || '';
    document.getElementById('memo').value = data.memo || '';
    
    // 担当者表示
    renderAssigneeTags();
    
    // 子タスク表示
    const childTasksEl = document.getElementById('childTasks');
    childTasksEl.innerHTML = '';
    state.currentChildTasks.forEach((task, i) => {
        addChildTaskToDom(task.text, task.done, i);
    });
    
    renderAssigneeSelect();
    renderLabelSelect();
    
    document.getElementById('ticketModal').classList.add('active');
}

/**
 * モーダルを閉じる
 */
export function closeModal() {
    document.getElementById('ticketModal').classList.remove('active');
    state.editingTicketId = null;
    window.__editingTicketId = null;
}

/**
 * チケットを保存
 */
export async function saveTicket() {
    const title = document.getElementById('ticketTitle').value.trim();
    
    // タイトル必須チェック
    if (!title) {
        alert('タイトルを入力してください');
        return;
    }
    
    const startDateVal = document.getElementById('startDate').value;
    const endDateVal = document.getElementById('endDate').value;
    const data = {
        title,
        startDate: startDateVal || null,
        endDate: endDateVal || null,
        effort: parseInt(document.getElementById('effort').value) || null,
        assignees: [...state.currentAssignees],
        mainAssignee: state.mainAssignee,
        labels: [...state.currentLabels],
        memo: document.getElementById('memo').value.trim(),
        childTasks: state.currentChildTasks.map(t => ({...t}))
    };
    
    try {
        if (state.editingTicketId) {
            // 既存チケットの更新
            const updated = await apiRequest('PUT', `${API_BASE}/${state.editingTicketId}`, data);
            state.currentTicketData[state.editingTicketId] = updated;
            
            const idx = state.allTickets.findIndex(t => t.ticketId === state.editingTicketId);
            if (idx !== -1) state.allTickets[idx] = updated;
            
            const ticketEl = document.querySelector(`.ticket[data-id="${state.editingTicketId}"]`);
            if (ticketEl) {
                const column = ticketEl.closest('.column');
                recreateTicket(ticketEl, updated, column);
            }
        } else {
            // 新規作成
            data.column = state.newTicketColumn || 'todo';
            const created = await apiRequest('POST', API_BASE, data);
            state.currentTicketData[created.ticketId] = created;
            state.allTickets.push(created);
            
            // 再描画で追加
            renderAllTickets();
        }
    } catch (error) {
        console.error('Failed to save ticket:', error);
        alert('保存に失敗しました: ' + error.message);
        return;
    }
    
    closeModal();
}

/**
 * 現在選択されているフィルター値を取得
 */
function getSelectedAssignee() {
    const select = document.getElementById('assigneeFilterSelect');
    return select ? select.value : '';
}

/**
 * モーダル関連のイベントを初期化
 */
export function initModal() {
    const modal = document.getElementById('ticketModal');
    
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', saveTicket);
    
    // モーダル外クリックで保存
    // テキスト選択ドラッグによる誤判定を防ぐため、mousedown/mouseup で判断
    let mouseDownOnOverlay = false;
    
    modal.addEventListener('mousedown', (e) => {
        // オーバーレイ（バックドロップ）上でマウスダウンした場合のみフラグを設定
        if (e.target.id === 'ticketModal') {
            mouseDownOnOverlay = true;
        }
    });
    
    modal.addEventListener('mouseup', (e) => {
        if (mouseDownOnOverlay && e.target.id === 'ticketModal') {
            // オーバーレイ上で mousedown と mouseup の両方があった場合のみ保存
            saveTicket();
        }
        mouseDownOnOverlay = false;
    });
}

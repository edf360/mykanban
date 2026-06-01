/**
 * レンダリング層
 * チケット要素の生成・描画・更新
 */

import { API_BASE, state, escapeHtml } from './state.js';
import { apiRequest, loadTickets } from './api.js';
import { renderProgressChart } from './charts.js';
import { openEditModal } from './modal.js';

/**
 * ラベル名から色情報を取得するマップ（設定データから構築）
 */
// グローバルイベントリスナーのクリーンアップ用配列
const progressEventListeners = new Map();

function getLabelColorMap() {
    const map = {};
    try {
        if (typeof Settings !== 'undefined' && Settings.settings) {
            const labels = Settings.settings().labels || [];
            labels.forEach(l => {
                if (l && l.name) {
                    map[l.name] = l.color || '#808080';
                }
            });
        }
    } catch (e) {
        console.warn('[renderer] Failed to get label colors:', e);
    }
    return map;
}

/**
 * 背景色に対するコントラスト文字色を計算（明るい背景なら黒、暗い背景なら白）
 */
function getContrastColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    return luminance > 128 ? '#000000' : '#ffffff';
}

/**
 * 現在選択されているフィルター値を取得（filter.jsからインポート可能にするため）
 */
export function getSelectedAssignee() {
    const select = document.getElementById('assigneeFilterSelect');
    return select ? select.value : '';
}

/**
 * チケットがフィルター条件に一致するかチェック
 */
export function ticketMatchesFilter(ticket) {
    // 担当者フィルター
    const selectedAssignee = getSelectedAssignee();
    if (selectedAssignee && !(ticket.assignees?.includes(selectedAssignee))) {
        return false;
    }

    // タイトル検索フィルター
    const keyword = state.searchKeyword?.trim().toLowerCase();
    if (keyword && !ticket.title?.toLowerCase().includes(keyword)) {
        return false;
    }

    return true;
}

/**
 * 進捗ドラッグ用のグローバルリスナーを全クリーンアップ
 */
function cleanupProgressListeners() {
    progressEventListeners.forEach(({ onMouseMove, onMouseUp }, id) => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    });
    progressEventListeners.clear();
}

/**
 * 全チケットを再描画
 */
export function renderAllTickets() {
    // 古い進捗ドラッグリスナーをクリーンアップ（メモリリーク防止）
    cleanupProgressListeners();
    
    // 各カラムのticket-listをクリア
    document.querySelectorAll('.ticket-list').forEach(list => {
        list.innerHTML = '';
    });
    
    state.allTickets.forEach(ticket => {
        if (!ticketMatchesFilter(ticket)) return;
        
        // アーカイブ済みのチケットはArchiveカラムに配置
        if (ticket.isArchived) {
            const archiveList = document.querySelector('#archiveColumn .ticket-list');
            if (archiveList) {
                const ticketEl = createTicketElement(ticket);
                archiveList.appendChild(ticketEl);
            }
        } else {
            // 通常カラムに配置
            const columnEl = document.querySelector(`.column[data-column="${ticket.column}"] .ticket-list`);
            if (columnEl) {
                const ticketEl = createTicketElement(ticket);
                columnEl.appendChild(ticketEl);
            }
        }
    });
    
    // カラムカウントを更新（メモカラムは除外）
    document.querySelectorAll('.column:not([data-column="memo"])').forEach(updateColumnCount);
}

/**
 * チケット要素を生成
 */
export function createTicketElement(data) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    ticket.draggable = true;
    ticket.dataset.id = data.ticketId;
    state.currentTicketData[data.ticketId] = data;

    const titleHtml = data.title ? escapeHtml(data.title) : '(タイトルなし)';
    
    // 上部にラベルと担当者を表示
    let topInfoHtml = '';
    if ((data.labels && data.labels.length > 0) || (data.assignees && data.assignees.length > 0)) {
        topInfoHtml = '<div class="ticket-top-info">';
        if (data.labels && data.labels.length > 0) {
            topInfoHtml += '<div class="ticket-labels">';
            const labelColors = getLabelColorMap();
            data.labels.forEach(label => {
                const color = labelColors[label] || '#808080';
                topInfoHtml += `<span class="ticket-label" style="background-color:${color};color:${getContrastColor(color)}">${escapeHtml(label)}</span>`;
            });
            topInfoHtml += '</div>';
        }
        if (data.assignees && data.assignees.length > 0) {
            topInfoHtml += '<div class="ticket-assignees">';
            data.assignees.forEach((assignee) => {
                const isMain = assignee === data.mainAssignee;
                const mainClass = isMain ? ' main' : '';
                const crownIcon = isMain ? '👑 ' : '';
                topInfoHtml += `<span class="ticket-assignee${mainClass}">${crownIcon}${escapeHtml(assignee)}</span>`;
            });
            topInfoHtml += '</div>';
        }
        topInfoHtml += '</div>';
    }

    // 子タスクをチケットに表示
    let childTasksHtml = '';
    if (data.childTasks && data.childTasks.length > 0) {
        childTasksHtml = '<div class="ticket-child-tasks">';
        data.childTasks.forEach((task, i) => {
            const doneClass = task.done ? ' done' : '';
            childTasksHtml += `
                <div class="ticket-child-task-item${doneClass}" data-child-index="${i}">
                    <input type="checkbox" ${task.done ? 'checked' : ''} data-child-check="${i}">
                    <span class="ticket-child-task-text">${escapeHtml(task.text)}</span>
                </div>`;
        });
        childTasksHtml += '</div>';
    }

    // 工数バッジ（XSS対策: escapeHtml使用）
    let effortBadge = '';
    if (data.effort != null) {
        effortBadge = `<span class="ticket-effort">${escapeHtml(String(data.effort))}h</span>`;
    }

    // data-*属性にもエスケープを適用
    const safeStartDate = data.startDate ? escapeHtml(String(data.startDate)) : '';
    const safeEndDate = data.endDate ? escapeHtml(String(data.endDate)) : '';
    let chartHtml = '';
    if (data.startDate && data.endDate) {
        chartHtml = `<div class="ticket-chart" data-start="${safeStartDate}" data-end="${safeEndDate}"></div>`;
    }

    ticket.innerHTML = `
        ${topInfoHtml}
        <div class="ticket-title-row">
            <div class="ticket-content">${titleHtml}</div>
            ${effortBadge}
        </div>
        ${childTasksHtml}
        ${chartHtml}
        <div class="progress-container">
            <span class="progress-label">進捗:</span>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${data.progress || 0}%"></div>
            </div>
            <span class="progress-text">${data.progress || 0}%</span>
        </div>
        <button class="delete-btn">&times;</button>
    `;

    // ドラッグイベント（dragdrop.jsで設定される）
    ticket.addEventListener('dragstart', handleDragStart);
    ticket.addEventListener('dragend', handleDragEnd);
    
    // チケットクリックでモーダルを開く
    let wasProgressDragging = false;
    ticket.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn') || e.target.closest('.progress-bar') || e.target.closest('[data-child-check]')) return;
        if (wasProgressDragging) return;
        if (data.isArchived) return;
        openEditModal(ticket.dataset.id);
    });

    // 子タスクのチェックボックスイベント
    const childCheckboxes = ticket.querySelectorAll('[data-child-check]');
    childCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            e.stopPropagation();
            const index = parseInt(checkbox.dataset.childCheck);
            try {
                const updated = await apiRequest('PATCH', `${API_BASE}/${ticket.dataset.id}/child-task/${index}`, { done: checkbox.checked });
                state.currentTicketData[ticket.dataset.id] = updated;
                const idx = state.allTickets.findIndex(t => t.ticketId === ticket.dataset.id);
                if (idx !== -1) state.allTickets[idx] = updated;
            } catch (error) {
                console.error('Failed to update child task:', error);
                checkbox.checked = !checkbox.checked;
            }
            
            const item = checkbox.closest('.ticket-child-task-item');
            if (item) {
                if (checkbox.checked) {
                    item.classList.add('done');
                } else {
                    item.classList.remove('done');
                }
            }
        });
    });

    // グラフを描画
    const chartEl = ticket.querySelector('.ticket-chart');
    if (chartEl) {
        renderProgressChart(chartEl, data.startDate, data.endDate);
    }
    
    // 進捗バーのドラッグ処理（メモリリーク修正: 名前付き関数でremoveEventListener可能に）
    const progressBar = ticket.querySelector('.progress-bar');
    const progressFill = ticket.querySelector('.progress-fill');
    const progressText = ticket.querySelector('.progress-text');
    
    let isDragging = false;
    
    const updateProgress = (clientX) => {
        const rect = progressBar.getBoundingClientRect();
        let percentage = ((clientX - rect.left) / rect.width) * 100;
        percentage = Math.max(0, Math.min(100, Math.round(percentage / 10) * 10));
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${percentage}%`;
    };
    
    progressBar.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        isDragging = true;
        wasProgressDragging = false;
        updateProgress(e.clientX);
        
        ticket.draggable = false;
    });
    
    // 名前付き関数として定義（removeEventListener用）
    const onMouseMove = (e) => {
        if (isDragging) {
            e.preventDefault();
            wasProgressDragging = true;
            updateProgress(e.clientX);
        }
    };
    
    const onMouseUp = async (e) => {
        if (isDragging) {
            isDragging = false;
            ticket.draggable = true;
            
            const percentage = parseInt(progressText.textContent);
            
            try {
                await apiRequest('PATCH', `${API_BASE}/${ticket.dataset.id}/progress`, { progress: percentage });

                // 進捗値をローカル状態に反映（カラム移動は行わない）
                const idx = state.allTickets.findIndex(t => t.ticketId === ticket.dataset.id);
                if (idx !== -1) {
                    state.allTickets[idx].progress = percentage;
                }
                // state.currentTicketData にも反映（グラフ再描画用）
                if (state.currentTicketData[ticket.dataset.id]) {
                    state.currentTicketData[ticket.dataset.id].progress = percentage;
                }
            } catch (error) {
                console.error('Failed to update progress:', error);
            }
            
            // 対象チケットの進捗グラフを更新
            const chartEl = ticket.querySelector('.ticket-chart');
            if (chartEl) {
                const ticketData = state.currentTicketData[ticket.dataset.id];
                if (ticketData && ticketData.startDate && ticketData.endDate) {
                    renderProgressChart(chartEl, ticketData.startDate, ticketData.endDate);
                }
            }
            
            // 個人の累積進捗グラフを更新（メモカラムに表示されている場合）
            if (typeof window.updateMemoColumn === 'function') {
                window.updateMemoColumn();
            }
            
            setTimeout(() => {
                wasProgressDragging = false;
            }, 100);
        }
    };
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    // クリーンアップ用マップに登録（チケット削除時に一括削除用）
    progressEventListeners.set(ticket.dataset.id, { onMouseMove, onMouseUp });

    // 削除ボタン
    const deleteBtn = ticket.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ticketData = state.currentTicketData[ticket.dataset.id];
        const isArchived = ticketData && ticketData.isArchived;
        
        if (isArchived) {
            if (!confirm('このチケットを完全に削除しますか？')) {
                return;
            }
        }
        
        try {
            const result = await apiRequest('DELETE', `${API_BASE}/${ticket.dataset.id}`, null);
            if (isArchived) {
                // 完全削除の場合（result は undefined）
                delete state.currentTicketData[ticket.dataset.id];
                state.allTickets = state.allTickets.filter(t => t.ticketId !== ticket.dataset.id);
            } else {
                // アーカイブ移動の場合（result にアーカイブされたチケットデータが含まれる）
                const archivedTicket = result;
                state.currentTicketData[ticket.dataset.id] = archivedTicket;
                const idx = state.allTickets.findIndex(t => t.ticketId === ticket.dataset.id);
                if (idx !== -1) {
                    state.allTickets[idx] = archivedTicket;
                } else {
                    state.allTickets.push(archivedTicket);
                }
            }
            renderAllTickets();
        } catch (error) {
            console.error('Failed to delete ticket:', error);
        }
    });

    return ticket;
}

/**
 * チケットを更新して再描画
 */
export function recreateTicket(ticketEl, data, column) {
    const oldId = ticketEl.dataset.id;
    
    // 古いチケットの進捗ドラッグリスナーをクリーンアップ
    const oldListeners = progressEventListeners.get(oldId);
    if (oldListeners) {
        document.removeEventListener('mousemove', oldListeners.onMouseMove);
        document.removeEventListener('mouseup', oldListeners.onMouseUp);
        progressEventListeners.delete(oldId);
    }
    
    const newTicket = createTicketElement(data);
    newTicket.dataset.id = oldId;
    state.currentTicketData[oldId] = data;
    
    // 新しいデータの進捗値を使用（古いDOMの値を無視）
    const percentage = data.progress || 0;
    const progressFill = newTicket.querySelector('.progress-fill');
    const progressText = newTicket.querySelector('.progress-text');
    if (progressFill) progressFill.style.width = `${percentage}%`;
    if (progressText) progressText.textContent = `${percentage}%`;
    
    // グラフを更新
    if (data.startDate && data.endDate) {
        const chartEl = newTicket.querySelector('.ticket-chart');
        if (chartEl) {
            renderProgressChart(chartEl, data.startDate, data.endDate);
        }
    }
    
    ticketEl.replaceWith(newTicket);
}

/**
 * カラムカウントを更新
 */
export function updateColumnCount(column) {
    const countEl = column.querySelector('.column-count');
    if (!countEl) return;
    const count = column.querySelectorAll('.ticket').length;
    countEl.textContent = `${count} 件`;
}

// ドラッグ関連のグローバル変数（dragdrop.jsと共有）
export let draggedTicket = null;

/**
 * ドラッグ開始処理（dragdrop.jsから呼び出し用）
 */
function handleDragStart(e) {
    draggedTicket = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dataset.id);
    
    removeDropIndicators();
}

/**
 * ドラッグ終了処理
 */
function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedTicket = null;
    
    document.querySelectorAll('.ticket-list').forEach(list => {
        list.classList.remove('drag-over');
    });
}

/**
 * ドロップインジケーターを削除
 */
export function removeDropIndicators() {
    document.querySelectorAll('.drop-indicator').forEach(indicator => {
        indicator.remove();
    });
}

// イベント用簡易バス
const listeners = {};
export function on(event, callback) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(callback);
}

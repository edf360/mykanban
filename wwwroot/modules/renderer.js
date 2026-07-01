/**
 * レンダリング層
 * チケット要素の生成・描画・更新
 */

import { API_BASE, state, escapeHtml, labelColorCacheInvalidated, getSettings, getAllTickets, getTicket, setTicket, removeTicket, updateTicketField } from './state.js';
import { loadUserSettings, saveUserSettings } from './userSettings.js';
import { apiRequest, loadTickets } from './api.js';
import { renderProgressChart } from './charts.js';
import { openEditModal } from './modal.js';
import { updateMemoColumn } from './memo.js';
import { showProgressSlider } from './progressSliderPopup.js';
import { showReviewIconPopup } from './reviewIconPopup.js';

/**
 * カラムの表示順位（HTMLのdata-column属性順と整合）
 */
const COLUMN_ORDER = {
    todo: 0,
    doing: 1,
    done: 2,
    archive: 3
};

/**
 * カラム名から順位を取得（未知のカラムは末尾に配置）
 */
function getColumnOrder(column) {
    return COLUMN_ORDER[column] ?? 999;
}

// ラベルカラーキャッシュ
let cachedLabelColors = null;

/**
 * 色値が有効なHEXコードか検証する（#RGB または #RRGGBB のみ許可）
 * 注意: 8桁HEX (#RRGGBBAA) はサポートしない
 */
function isValidHexColor(color) {
    if (typeof color !== 'string') return false;
    return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color);
}

/**
 * 色値を正規化する（不正な場合はデフォルトグレーを返す）
 */
function sanitizeColor(color) {
    if (isValidHexColor(color)) {
        // #RGB を #RRGGBB に展開
        if (color.length === 4) {
            return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
        }
        return color.toLowerCase();
    }
    console.warn(`[renderer] Invalid color value "${color}", using default`);
    return '#808080';
}

function getLabelColorMap() {
    if (cachedLabelColors !== null) {
        if (labelColorCacheInvalidated) {
            cachedLabelColors = null;
        } else {
            return cachedLabelColors;
        }
    }
    const map = {};
    try {
        const s = getSettings();
        const labels = s.labels || [];
        labels.forEach(l => {
            if (l && l.name) {
                map[l.name] = sanitizeColor(l.color || '#808080');
            }
        });
    } catch (e) {
        console.warn('[renderer] Failed to get label colors:', e);
    }
    cachedLabelColors = map;
    return map;
}

/**
 * 背景色に対するコントラスト文字色を計算（明るい背景なら黒、暗い背景なら白）
 * 入力は sanitizeColor() 経由で #RRGGBB 形式が保証されていること
 */
function getContrastColor(hex) {
    const c = hex.replace('#', '');
    if (c.length !== 6) {
        // 不正な形式の場合はデフォルト黒を返す
        return '#000000';
    }
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
        return '#000000';
    }
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    return luminance > 128 ? '#000000' : '#ffffff';
}

/**
 * チケットがフィルター条件に一致するかチェック
 * @param {object} ticket - チケットデータ
 * @returns {boolean} フィルターに一致するかどうか
 */
export function ticketMatchesFilter(ticket) {
    // 担当者フィルター
    const selectedAssignee = state.filterAssignee;
    if (selectedAssignee && !(ticket.assignees?.includes(selectedAssignee))) {
        return false;
    }

    // メイン担当限定フィルター（担当者が選択されている場合のみ有効）
    if (state.filterMainOnly && selectedAssignee) {
        if (ticket.mainAssignee !== selectedAssignee) {
            return false;
        }
    }

    // ラベルフィルター
    const selectedLabel = state.filterLabel;
    if (selectedLabel && !(ticket.labels?.includes(selectedLabel))) {
        return false;
    }

    // チケット検索フィルター（タイトル・メモ・子タスク名）
    const keyword = state.searchKeyword?.trim().toLowerCase();
    if (keyword) {
        const title = (ticket.title || '').toLowerCase();
        const memo = (ticket.memo || '').toLowerCase();
        const childTasksText = (ticket.childTasks || [])
            .map(t => t.text || '')
            .join(' ')
            .toLowerCase();
        const searchable = `${title} ${memo} ${childTasksText}`;
        if (!searchable.includes(keyword)) {
            return false;
        }
    }

    return true;
}

/**
 * 全チケットを再描画
 * @returns {void}
 */
export function renderAllTickets() {
    // 各カラムのticket-listをクリア
    document.querySelectorAll('.ticket-list').forEach(list => {
        list.replaceChildren();
    });
    
    // Positionでソートして描画（ドラッグ＆ドロップ後の順番を反映）
    // カラム順はフロントで定義された COLUMN_ORDER に従ってソート
    // バックエンドの並び順（string順）はUI表示には依存しない
    const sortedTickets = [...getAllTickets()].sort((a, b) => {
        if (a.column !== b.column) {
            return getColumnOrder(a.column) - getColumnOrder(b.column);
        }
        return (b.position ?? 0) - (a.position ?? 0) || a.ticketId.localeCompare(b.ticketId);
    });
    
    sortedTickets.forEach(ticket => {
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
    
}

/**
 * チケット要素を生成
 */
export function createTicketElement(data) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    ticket.draggable = true;
    ticket.dataset.id = data.ticketId;
    setTicket(data.ticketId, data);
    
    // 折り畳み状態の復元（ユーザー設定から）
    const userSettings = loadUserSettings();
    if (userSettings.collapsedTickets && userSettings.collapsedTickets.includes(data.ticketId)) {
        ticket.classList.add('collapsed');
    }

    // 色分けクラスの付与（ローカルタイムゾーン使用）
    // done/archiveのチケットは逾期・当日完了の色分けを表示しない
    const today = new Date().toLocaleDateString('sv-SE');
    const isDoneOrArchived = data.column === 'done' || data.isArchived;
    if (isDoneOrArchived) {
        ticket.classList.add('done-or-archived');
        ticket.classList.add('ticket-completed');
    }
    if (data.endDate && !isDoneOrArchived) {
        if (data.endDate < today) {
            ticket.classList.add('overdue');
        } else if (data.endDate === today) {
            ticket.classList.add('due-today');
        }
    }
    if (data.priority === 'high') {
        ticket.classList.add('high-priority');
    }
    if (data.status === 'blocked') {
        ticket.classList.add('blocked');
    }

    const titleHtml = data.title ? escapeHtml(data.title) : '（未設定）';
    
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
                topInfoHtml += `<span class="ticket-assignee${mainClass}">${escapeHtml(assignee)}</span>`;
            });
            topInfoHtml += '</div>';
        }
        topInfoHtml += '</div>';
    }

    // 子タスクをチケットに表示（done=true のタスクは非表示）
    let childTasksHtml = '';
    const visibleChildTasks = (data.childTasks || []).filter(task => !task.done);
    if (visibleChildTasks.length > 0) {
        childTasksHtml = '<div class="ticket-child-tasks">';
        visibleChildTasks.forEach((task) => {
            const childId = task.id || '';
            const progress = task.progress || 0;
            const reviewState = task.reviewState || 'none';
            const reviewIcons = {
                'none': '📄',
                'editing': '📝',
                'requested': '📑',
                'completed': '✅',
                'thumbsup': '👍',
                'happy': '😄',
                'sad': '😥',
                'shock': '😱'
            };
            const reviewIcon = reviewIcons[reviewState] || '📄';
            const memoTooltip = task.memo ? ` title="${escapeHtml(task.memo)}"` : '';
            childTasksHtml += `
                <div class="ticket-child-task-item" data-child-id="${childId}">
                    <span class="ticket-child-task-text"${memoTooltip}>${escapeHtml(task.text)}</span>
                    <span class="ticket-child-task-progress" data-child-progress="${childId}" title="クリックして進捗率を変更">${progress}%</span>
                    <button class="ticket-child-task-review-btn ${reviewState !== 'none' && reviewState !== 'document' ? 'review-' + reviewState : ''}" data-review-id="${childId}" title="クリックしてアイコンを選択">${reviewIcon}</button>
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

    if (data.isEmergency) {
        ticket.classList.add('emergency');
    }
    // 折り畳みボタンを表示するかどうか（子タスクまたは期限日・終了日が設定されている場合のみ）
    const showCollapseBtn = (data.childTasks && data.childTasks.length > 0) || (data.startDate && data.endDate);

    const ticketMemoTitle = data.memo ? ` title="${escapeHtml(data.memo)}"` : '';
    ticket.innerHTML = `
        ${topInfoHtml}
        <div class="ticket-title-row">
            ${showCollapseBtn ? '<button class="ticket-collapse-btn" title="折り畳む/展開">▼</button>' : ''}
            <div class="ticket-content"${ticketMemoTitle}>${titleHtml}</div>
            <span class="progress-text" title="${(data.childTasks && data.childTasks.length > 0) ? '子タスクがあるため直接編集できません' : 'クリックして進捗率を変更'}">${data.progress || 0}%</span>
            ${effortBadge}
        </div>
        ${childTasksHtml}
        ${chartHtml}
        <button class="delete-btn">&times;</button>
    `;

    // ドラッグイベント（dragdrop.jsで設定される）
    ticket.addEventListener('dragstart', handleDragStart);
    ticket.addEventListener('dragend', handleDragEnd);
    
    // 折り畳みトグルボタン（存在する場合のみ）
    const collapseBtn = ticket.querySelector('.ticket-collapse-btn');
    if (collapseBtn) {
        collapseBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ticket.classList.toggle('collapsed');
            // 折り畳み状態をユーザー設定に保存
            const userSettings = loadUserSettings();
            if (!userSettings.collapsedTickets) {
                userSettings.collapsedTickets = [];
            }
            const ticketId = ticket.dataset.id;
            const isCollapsed = ticket.classList.contains('collapsed');
            if (isCollapsed) {
                if (!userSettings.collapsedTickets.includes(ticketId)) {
                    userSettings.collapsedTickets.push(ticketId);
                }
            } else {
                userSettings.collapsedTickets = userSettings.collapsedTickets.filter(id => id !== ticketId);
            }
            saveUserSettings(userSettings);
        });
    }
    
    // チケットクリックでモーダルを開く
    ticket.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn') || e.target.closest('.progress-slider-popup') || e.target.classList.contains('ticket-collapse-btn')) return;
        if (data.isArchived) return;
        openEditModal(ticket.dataset.id);
    });

    // グラフを描画（履歴データを非同期で取得）
    const chartEl = ticket.querySelector('.ticket-chart');
    if (chartEl) {
        const ticketId = ticket.dataset.id;
        apiRequest(`${API_BASE}/tickets/${encodeURIComponent(ticketId)}/history`)
            .then(histories => {
                renderProgressChart(chartEl, data.startDate, data.endDate, data.progress || 0, histories);
            })
            .catch(() => {
                renderProgressChart(chartEl, data.startDate, data.endDate, data.progress || 0, []);
            });
    }
    
    // 進捗テキストクリックでスライダーポップアップを表示（子タスクがある場合は無効）
    const progressText = ticket.querySelector('.progress-text');
    const hasChildTasks = data.childTasks && data.childTasks.length > 0;
    
    // 子タスクがある場合は進捗テキストをクリック不可（クリック時に警告表示）
    if (hasChildTasks) {
        progressText.classList.add('disabled');
        progressText.addEventListener('click', (e) => {
            e.stopPropagation();
            alert('子タスクが存在するため、メインの進捗率は変更できません。');
        });
    } else {
        progressText.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ticketId = ticket.dataset.id;
            const today = new Date().toISOString().split('T')[0];
            
            // 今日の進捗・実績時間を取得
            let currentHours = 0;
            let currentProgress = data.progress || 0;
            try {
                const actuals = await apiRequest('GET', `${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, null);
                const todayActual = actuals.find(a => {
                    const actualDate = (a.Date || a.date || '').split('T')[0];
                    return actualDate === today;
                });
                if (todayActual) {
                    currentHours = todayActual.Hours ?? todayActual.hours ?? 0;
                    currentProgress = todayActual.ProgressRate ?? todayActual.progressRate ?? currentProgress;
                }
            } catch (error) {
                console.error('Failed to load actuals:', error);
            }
            
            showProgressSlider(progressText, currentProgress, async (newProgress, newHours) => {
                const oldProgress = data.progress || 0;
                try {
                    // 実績時間を保存
                    await apiRequest('POST', `${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, {
                        date: today,
                        hours: newHours,
                        progressRate: newProgress
                    });
                    
                    // 進捗率を更新
                    if (newProgress !== oldProgress) {
                        await apiRequest('PATCH', `${API_BASE}/${encodeURIComponent(ticketId)}/progress`, { progress: newProgress });
                        updateTicketField(ticketId, 'progress', newProgress);
                    }
                    
                    // SignalRのデバウンスにより再描画がスキップされる可能性があるため明示的に再描画
                    renderAllTickets();
                } catch (error) {
                    console.error('Failed to update progress:', error);
                }
            }, ticketId, today, null, currentHours);
        });
    }

    // 子タスクの進捗スライダー
    const childProgressSpans = ticket.querySelectorAll('[data-child-progress]');
    childProgressSpans.forEach(async (span) => {
        span.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ticketId = ticket.dataset.id;
            const childId = span.dataset.childProgress;
            const currentProgress = parseInt(span.textContent) || 0;
            const today = new Date().toISOString().split('T')[0];
            
            // 子タスクインデックスを取得
            const ticketData = getTicket(ticketId);
            const childTasks = ticketData?.childTasks || [];
            const childTaskIndex = childTasks.findIndex(t => t.id === childId);
            
            // 今日の進捗・実績時間を取得
            let currentHours = 0;
            let progress = currentProgress;
            try {
                const actuals = await apiRequest('GET', `${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, null);
                const todayActual = actuals.find(a => {
                    const actualDate = (a.Date || a.date || '').split('T')[0];
                    const dateMatches = actualDate === today;
                    const indexMatches = a.ChildTaskIndex === childTaskIndex || a.childTaskIndex === childTaskIndex || (childTaskIndex === -1 && a.ChildTaskIndex === undefined && a.childTaskIndex === undefined);
                    return dateMatches && indexMatches;
                });
                if (todayActual) {
                    currentHours = todayActual.Hours ?? todayActual.hours ?? 0;
                    progress = todayActual.ProgressRate ?? todayActual.progressRate ?? progress;
                }
            } catch (error) {
                console.error('Failed to load actuals:', error);
            }
            
            showProgressSlider(span, progress, async (newProgress, newHours) => {
                try {
                    // 実績時間を保存
                    await apiRequest('POST', `${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, {
                        date: today,
                        hours: newHours,
                        progressRate: newProgress,
                        childTaskIndex: childTaskIndex >= 0 ? childTaskIndex : undefined
                    });
                    
                    const updated = await apiRequest('PATCH', `${API_BASE}/${encodeURIComponent(ticketId)}/child-task/${encodeURIComponent(childId)}`, { done: false, progress: newProgress });
                    setTicket(ticketId, updated);
                    
                    // SignalRのデバウンスにより再描画がスキップされる可能性があるため明示的に再描画
                    renderAllTickets();
                } catch (error) {
                    console.error('Failed to update child task progress:', error);
                }
            }, ticketId, today, childTaskIndex >= 0 ? childTaskIndex : null, currentHours);
        });
    });

    // 削除ボタン
    const deleteBtn = ticket.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ticketData = getTicket(ticket.dataset.id);
        const isArchived = ticketData && ticketData.isArchived;
        
        if (isArchived) {
            if (!confirm('このチケットを完全に削除しますか？')) {
                return;
            }
        }
        
        try {
            const result = await apiRequest('DELETE', `${API_BASE}/${encodeURIComponent(ticket.dataset.id)}`, null);
            if (isArchived) {
                // 完全削除の場合（result は undefined）
                removeTicket(ticket.dataset.id);
            } else {
                // アーカイブ移動の場合（result にアーカイブされたチケットデータが含まれる）
                const archivedTicket = result;
                setTicket(ticket.dataset.id, archivedTicket);
            }
            // 描画はSignalR通知に任せる
        } catch (error) {
            console.error('Failed to delete ticket:', error);
        }
    });

    // アイコン選択ボタン
    const reviewBtns = ticket.querySelectorAll('.ticket-child-task-review-btn');
    reviewBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const childId = btn.dataset.reviewId;
            const ticketId = ticket.dataset.id;
            const ticketData = getTicket(ticketId);
            if (!ticketData) return;

            const childTask = ticketData.childTasks?.find(t => t.id === childId);
            if (!childTask) return;

            const currentState = childTask.reviewState || 'none';

            showReviewIconPopup(btn, currentState, async (state) => {
                try {
                    const updated = await apiRequest('PATCH', `${API_BASE}/${encodeURIComponent(ticketId)}/child-task/${encodeURIComponent(childId)}`, {
                        done: childTask.done,
                        progress: childTask.progress,
                        reviewState: state
                    });
                    setTicket(ticketId, updated);
                    // 描画はSignalR通知に任せる
                } catch (error) {
                    console.error('Failed to update review icon:', error);
                }
            });
        });
    });

    return ticket;
}

/**
 * チケットを更新して再描画
 */
export function recreateTicket(ticketEl, data, column) {
    const oldId = ticketEl.dataset.id;
    
    // oldIdをdataに設定してcreateTicketElement内で処理させる
    data.ticketId = oldId;
    const newTicket = createTicketElement(data);
    
    // 新しいデータの進捗値を使用（古いDOMの値を無視）
    const percentage = data.progress || 0;
    const progressText = newTicket.querySelector('.progress-text');
    if (progressText) progressText.textContent = `${percentage}%`;
    
    // グラフを更新
    if (data.startDate && data.endDate) {
        const chartEl = newTicket.querySelector('.ticket-chart');
        if (chartEl) {
            apiRequest(`${API_BASE}/tickets/${encodeURIComponent(data.id)}/history`)
                .then(histories => {
                    renderProgressChart(chartEl, data.startDate, data.endDate, data.progress || 0, histories);
                })
                .catch(() => {
                    renderProgressChart(chartEl, data.startDate, data.endDate, data.progress || 0, []);
                });
        }
    }
    
    ticketEl.replaceWith(newTicket);
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
    
    // ドラッグ中のチケット自身にもdragoverリスナーを設定
    // これがないとドラッグ中のチケット上でdragoverが発火した際にpreventDefault()が呼ばれず、dropイベントが発火しない
    this._dragOverHandler = (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
    };
    this.addEventListener('dragover', this._dragOverHandler);
    
    removeDropIndicators();
}

/**
 * ドラッグ終了処理
 */
function handleDragEnd(e) {
    // ドラッグ中のチケットからdragoverリスナーを削除
    if (this._dragOverHandler) {
        this.removeEventListener('dragover', this._dragOverHandler);
        delete this._dragOverHandler;
    }
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


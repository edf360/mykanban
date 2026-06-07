/**
 * レンダリング層
 * チケット要素の生成・描画・更新
 */

import { API_BASE, state, escapeHtml, labelColorCacheInvalidated, getSettings, getAllTickets, getTicket, setTicket, removeTicket, updateTicketField } from './state.js';
import { apiRequest, loadTickets } from './api.js';
import { renderProgressChart } from './charts.js';
import { openEditModal } from './modal.js';
import { updateMemoColumn } from './memo.js';

/**
 * ラベル名から色情報を取得するマップ（設定データから構築）
 */
// 進捗スライダーのグローバルイベントリスナー用マップ
const progressSliderListeners = new Map();

// ラベルカラーキャッシュ
let cachedLabelColors = null;

/**
 * 色値が有効なHEXコードか検証する（#RGB または #RRGGBB のみ許可）
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
 * チケットがフィルター条件に一致するかチェック
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
 * 進捗スライダー用のグローバルリスナーを全クリーンアップ
 */
function cleanupProgressListeners() {
    progressSliderListeners.forEach(({ onClick }, id) => {
        document.removeEventListener('click', onClick);
    });
    progressSliderListeners.clear();
    // 表示中のスライダーを削除
    document.querySelectorAll('.progress-slider-popup').forEach(el => el.remove());
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
    
    // Positionでソートして描画（ドラッグ＆ドロップ後の順番を反映）
    const sortedTickets = getAllTickets().sort((a, b) => {
        if (a.column !== b.column) {
            return a.column.localeCompare(b.column);
        }
        return (a.position ?? 0) - (b.position ?? 0);
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

    // 色分けクラスの付与（ローカルタイムゾーン使用）
    const today = new Date().toLocaleDateString('sv-SE');
    if (data.endDate) {
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

    // 子タスクをチケットに表示（done=true のタスクは非表示）
    let childTasksHtml = '';
    const visibleChildTasks = (data.childTasks || []).filter(task => !task.done);
    if (visibleChildTasks.length > 0) {
        childTasksHtml = '<div class="ticket-child-tasks">';
        visibleChildTasks.forEach((task) => {
            const childId = task.id || '';
            const progress = task.progress || 0;
            childTasksHtml += `
                <div class="ticket-child-task-item" data-child-id="${childId}">
                    <span class="ticket-child-task-text">${escapeHtml(task.text)}</span>
                    <span class="ticket-child-task-progress" data-child-progress="${childId}" title="クリックして進捗率を変更">${progress}%</span>
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
            <span class="progress-text" title="${(data.childTasks && data.childTasks.length > 0) ? '子タスクがあるため直接編集できません' : 'クリックして進捗率を変更'}">${data.progress || 0}%</span>
        </div>
        <button class="delete-btn">&times;</button>
    `;

    // ドラッグイベント（dragdrop.jsで設定される）
    ticket.addEventListener('dragstart', handleDragStart);
    ticket.addEventListener('dragend', handleDragEnd);
    
    // チケットクリックでモーダルを開く
    ticket.addEventListener('click', (e) => {
        if (e.target.classList.contains('delete-btn') || e.target.closest('.progress-slider-popup')) return;
        if (data.isArchived) return;
        openEditModal(ticket.dataset.id);
    });

    // グラフを描画
    const chartEl = ticket.querySelector('.ticket-chart');
    if (chartEl) {
        renderProgressChart(chartEl, data.startDate, data.endDate, data.progress || 0);
    }
    
    // 進捗テキストクリックでスライダーポップアップを表示（子タスクがある場合は無効）
    const progressText = ticket.querySelector('.progress-text');
    const progressContainer = ticket.querySelector('.progress-container');
    const hasChildTasks = data.childTasks && data.childTasks.length > 0;
    
    // 子タスクがある場合は進捗テキストをクリック不可（クリック時に警告表示）
    if (hasChildTasks) {
        progressText.classList.add('disabled');
        progressText.addEventListener('click', (e) => {
            e.stopPropagation();
            alert('子タスクが存在するため、メインの進捗率は変更できません。');
        });
    } else {
        const showProgressSlider = (e) => {
            e.stopPropagation();
            // 既存のスライダーを削除
            document.querySelectorAll('.progress-slider-popup').forEach(el => el.remove());
            
            // チケットのドラッグを一時的に無効化
            const originalDraggable = ticket.draggable;
            ticket.draggable = false;
            
            const popup = document.createElement('div');
            popup.className = 'progress-slider-popup';
            popup.innerHTML = `
                <input type="range" min="0" max="100" step="10" value="${data.progress || 0}" class="progress-slider-input">
                <div class="progress-slider-label">${data.progress || 0}%</div>
            `;
            progressContainer.appendChild(popup);
            
            const slider = popup.querySelector('.progress-slider-input');
            const label = popup.querySelector('.progress-slider-label');
            
            // スライダー上の全てのポインターイベントを阻止（チケットドラッグと干渉しないように）
            ['mousedown', 'pointerdown', 'touchstart', 'click'].forEach(eventType => {
                slider.addEventListener(eventType, (e) => e.stopPropagation());
                popup.addEventListener(eventType, (e) => e.stopPropagation());
            });
            
            const updateSliderLabel = () => {
                label.textContent = `${slider.value}%`;
            };
            slider.addEventListener('input', updateSliderLabel);
            
            const saveProgress = async () => {
                const newProgress = parseInt(slider.value);
                const oldProgress = data.progress || 0;
                
                if (newProgress !== oldProgress) {
                    try {
                        await apiRequest('PATCH', `${API_BASE}/${encodeURIComponent(ticket.dataset.id)}/progress`, { progress: newProgress });
                        updateTicketField(ticket.dataset.id, 'progress', newProgress);
                        
                        // 進捗テキストを更新
                        if (progressText) progressText.textContent = `${newProgress}%`;
                        
                        // 進捗グラフを更新
                        const chartEl = ticket.querySelector('.ticket-chart');
                        if (chartEl) {
                            const ticketData = getTicket(ticket.dataset.id);
                            if (ticketData && ticketData.startDate && ticketData.endDate) {
                                renderProgressChart(chartEl, ticketData.startDate, ticketData.endDate, ticketData.progress || 0);
                            }
                        }
                        
                        // 累積進捗グラフを更新
                        updateMemoColumn();
                    } catch (error) {
                        console.error('Failed to update progress:', error);
                    }
                }
            };
            
            const hideSlider = () => {
                // チケットのドラッグを復元
                ticket.draggable = originalDraggable;
                saveProgress();
                popup.remove();
                document.removeEventListener('click', onClickOutside);
                progressSliderListeners.delete(ticket.dataset.id);
            };
            
            const onClickOutside = (e) => {
                if (!popup.contains(e.target)) {
                    hideSlider();
                }
            };
            
            setTimeout(() => {
                document.addEventListener('click', onClickOutside);
            }, 0);
            
            progressSliderListeners.set(ticket.dataset.id, { onClick: onClickOutside });
        };
        
        progressText.addEventListener('click', showProgressSlider);
    }

    // 子タスクの進捗スライダー
    const childProgressSpans = ticket.querySelectorAll('[data-child-progress]');
    childProgressSpans.forEach(span => {
        span.addEventListener('click', async (e) => {
            e.stopPropagation();
            const childId = span.dataset.childProgress;
            const currentProgress = parseInt(span.textContent) || 0;
            
            // 既存のスライダーを削除
            document.querySelectorAll('.child-progress-slider-popup').forEach(el => el.remove());
            
            const popup = document.createElement('div');
            popup.className = 'child-progress-slider-popup';
            popup.innerHTML = `
                <input type="range" min="0" max="100" step="10" value="${currentProgress}" class="child-progress-slider-input">
                <div class="child-progress-slider-label">${currentProgress}%</div>
            `;
            
            const rect = span.getBoundingClientRect();
            popup.style.position = 'fixed';
            popup.style.top = `${rect.top - 60}px`;
            popup.style.left = `${rect.left}px`;
            document.body.appendChild(popup);
            
            const slider = popup.querySelector('.child-progress-slider-input');
            const label = popup.querySelector('.child-progress-slider-label');
            
            slider.addEventListener('input', () => {
                label.textContent = `${slider.value}%`;
            });
            
            slider.addEventListener('change', async () => {
                const newProgress = parseInt(slider.value);
                try {
                    const updated = await apiRequest('PATCH', `${API_BASE}/${encodeURIComponent(ticket.dataset.id)}/child-task/${encodeURIComponent(childId)}`, { done: false, progress: newProgress });
                    setTicket(ticket.dataset.id, updated);
                    
                    // 進捗テキストを更新
                    const progressText = ticket.querySelector('.progress-text');
                    if (progressText) progressText.textContent = `${updated.progress || 0}%`;
                    
                    // 子タスク進捗テキストを更新
                    span.textContent = `${newProgress}%`;
                    
                    // 進捗グラフを更新
                    const chartEl = ticket.querySelector('.ticket-chart');
                    if (chartEl && updated.startDate && updated.endDate) {
                        renderProgressChart(chartEl, updated.startDate, updated.endDate, updated.progress || 0);
                    }
                    
                    // 累積進捗グラフを更新
                    updateMemoColumn();
                } catch (error) {
                    console.error('Failed to update child task progress:', error);
                }
                popup.remove();
            });
            
            // クリックで閉じる
            const closeHandler = (e) => {
                if (!popup.contains(e.target)) {
                    popup.remove();
                    document.removeEventListener('click', closeHandler);
                }
            };
            setTimeout(() => document.addEventListener('click', closeHandler), 0);
        });
    });

    // 削除ボタン
    const deleteBtn = ticket.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        // リスナーを即座に削除（リーク防止）
        progressSliderListeners.delete(ticket.dataset.id);
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
    
    // 古いチケットのスライダーリスナーをクリーンアップ
    const oldListeners = progressSliderListeners.get(oldId);
    if (oldListeners) {
        document.removeEventListener('click', oldListeners.onClick);
        progressSliderListeners.delete(oldId);
    }
    
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
            renderProgressChart(chartEl, data.startDate, data.endDate, data.progress || 0);
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

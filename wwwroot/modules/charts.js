/**
 * グラフ描画モジュール
 * 進捗予実グラフと担当者累積工数グラフのSVG描画
 */

import { state, formatDateWithDay } from './state.js';

/**
 * 個別チケットの進捗予実グラフを描画
 * @param {HTMLElement} container - グラフ配置コンテナ
 * @param {string} startDate - 開始日
 * @param {string} endDate - 終了日
 */
export function renderProgressChart(container, startDate, endDate) {
    const width = 260;
    const height = 50;
    const labelHeight = 18;
    const padding = { top: 5, right: 20, bottom: 5, left: 20 };
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // グラフの右端は終了日と本日のうち遅い方
    const graphEnd = today > end ? today : end;
    
    // 今日が終了日以降の場合は進捗率を取得
    // state.currentTicketData から直接取得（DOM要素に依存しない）
    let currentProgress = 0;
    const ticketId = container.closest('.ticket')?.dataset.id;
    if (ticketId) {
        const data = state.currentTicketData[ticketId];
        if (data) {
            currentProgress = data.progress || 0;
        }
    }
    
    // グラフの描画領域
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    
    // 座標計算
    const xScale = (date) => {
        const time = date.getTime();
        const startTime = start.getTime();
        const graphEndTime = graphEnd.getTime();
        if (graphEndTime === startTime) return 0;
        return ((time - startTime) / (graphEndTime - startTime)) * graphWidth + padding.left;
    };
    
    const yScale = (progress) => {
        return graphHeight - (progress / 100) * graphHeight + padding.top;
    };
    
    // 予定線: 開始日(0%) → 終了日(100%) — 青点線
    const plannedLine = `
        <line
            x1="${xScale(start)}" y1="${yScale(0)}"
            x2="${xScale(end)}" y2="${yScale(100)}"
            stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,4"
        />
    `;
    
    // 実績線: 開始日(0%) → 今日(現在の進捗率) — 赤実線
    let actualLine = '';
    if (today >= start) {
        const actualEndX = today > end ? width - padding.right : xScale(today);
        const actualEndY = yScale(currentProgress);
        actualLine = `
            <line
                x1="${xScale(start)}" y1="${yScale(0)}"
                x2="${actualEndX}" y2="${actualEndY}"
                stroke="#ef4444" stroke-width="1.5"
            />
            <circle cx="${actualEndX}" cy="${actualEndY}" r="3" fill="#ef4444"/>
        `;
    }
    
    // グリッド線
    const gridLines = `
        <line x1="${padding.left}" y1="${yScale(0)}" x2="${width - padding.right}" y2="${yScale(0)}" stroke="#d1d5db" stroke-width="0.5"/>
        <line x1="${padding.left}" y1="${yScale(25)}" x2="${width - padding.right}" y2="${yScale(25)}" stroke="#e5e7eb" stroke-width="0.5"/>
        <line x1="${padding.left}" y1="${yScale(50)}" x2="${width - padding.right}" y2="${yScale(50)}" stroke="#e5e7eb" stroke-width="0.5"/>
        <line x1="${padding.left}" y1="${yScale(75)}" x2="${width - padding.right}" y2="${yScale(75)}" stroke="#e5e7eb" stroke-width="0.5"/>
        <line x1="${padding.left}" y1="${yScale(100)}" x2="${width - padding.right}" y2="${yScale(100)}" stroke="#d1d5db" stroke-width="0.5"/>
    `;
    
    // 日付ラベル
    const startDateLabel = formatDateWithDay(start);
    const rightDateLabel = today > end ? formatDateWithDay(today) : formatDateWithDay(end);
    const dateLabels = `
        <text x="${padding.left}" y="${height + labelHeight - 2}" font-size="12" fill="#6b7280" text-anchor="middle">${startDateLabel}</text>
        <text x="${width - padding.right}" y="${height + labelHeight - 2}" font-size="12" fill="#6b7280" text-anchor="middle">${rightDateLabel}</text>
    `;
    
    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height + labelHeight}" xmlns="http://www.w3.org/2000/svg">
            ${gridLines}
            ${plannedLine}
            ${actualLine}
            ${dateLabels}
        </svg>
    `;
}

/**
 * 担当者の累積予実グラフを描画
 * @param {HTMLElement} container - グラフ配置コンテナ
 * @param {string} assigneeName - 担当者名
 */
export function renderAssigneeChart(container, assigneeName) {
    const width = 400;
    const height = 180;
    const padding = { top: 10, right: 20, bottom: 25, left: 40 };
    
    // この担当者のチケットをフィルタ（アーカイブ除外）
    const assigneeTickets = state.allTickets.filter(t =>
        t.assignees && t.assignees.includes(assigneeName)
        && t.startDate && t.endDate
        && !t.isArchived
    );
    
    if (assigneeTickets.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:12px;">データがありません</div>';
        return;
    }
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // 全チケットの開始日・終了日からグラフの範囲を計算
    let minDate = new Date(assigneeTickets[0].startDate);
    let maxDate = new Date(assigneeTickets[0].endDate);
    
    assigneeTickets.forEach(t => {
        const s = new Date(t.startDate);
        const e = new Date(t.endDate);
        if (s < minDate) minDate = s;
        if (e > maxDate) maxDate = e;
    });
    
    // グラフの右端は最終終了日と本日のうち遅い方
    const graphEnd = today > maxDate ? today : maxDate;
    
    const graphWidth = width - padding.left - padding.right;
    const graphHeight = height - padding.top - padding.bottom;
    
    // 日付 → X座標
    const xScale = (date) => {
        const time = date.getTime();
        const startTime = minDate.getTime();
        const endTime = graphEnd.getTime();
        if (endTime === startTime) return 0;
        return ((time - startTime) / (endTime - startTime)) * graphWidth + padding.left;
    };
    
    // 各日付の累積予定工数・実績工数を計算
    const days = [];
    const current = new Date(minDate);
    while (current <= graphEnd) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }
    
    const plannedCumulative = [];
    const actualCumulative = [];
    let totalPlanned = 0;
    let totalActual = 0;
    
    days.forEach(day => {
        assigneeTickets.forEach(ticket => {
            const start = new Date(ticket.startDate);
            const end = new Date(ticket.endDate);
            const effort = ticket.effort || 0;
            
            if (day >= start && day <= end) {
                const durationDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
                const dailyEffort = effort / durationDays;
                totalPlanned += dailyEffort;
            }
            
            // 実績は「今日時点で完了した分」をバーンインとして累積
            // 各日付において、その日までに完了した実績工数を計算
            if (day <= today && day >= start) {
                const progress = ticket.progress || 0;
                const actualEffort = effort * (progress / 100);
                const daysFromStart = Math.round((day - start) / (1000 * 60 * 60 * 24));
                const totalDuration = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
                // 経過日数比率に基づいてその日までの累積実績を計算
                const ratio = Math.min(1, (daysFromStart + 1) / totalDuration);
                const dailyActual = actualEffort * ratio;
                // 前日までの実績を引いて日次分のみ加算（初日は全体）
                if (daysFromStart === 0) {
                    totalActual += dailyActual;
                } else {
                    const prevRatio = Math.min(1, daysFromStart / totalDuration);
                    const prevDaily = actualEffort * prevRatio;
                    totalActual += dailyActual - prevDaily;
                }
            }
        });
        
        plannedCumulative.push(totalPlanned);
        actualCumulative.push(Math.min(totalActual, totalPlanned));
    });
    
    const maxEffort = Math.max(...plannedCumulative, 1);
    const yMax = Math.ceil(maxEffort * 1.1 / 5) * 5;
    
    const yScale = (value) => {
        return graphHeight - (value / yMax) * graphHeight + padding.top;
    };
    
    // 予定線（青色点線）
    let plannedPath = '';
    days.forEach((day, i) => {
        const x = xScale(day);
        const y = yScale(plannedCumulative[i]);
        if (i === 0) {
            plannedPath += `M ${x} ${y}`;
        } else {
            plannedPath += ` L ${x} ${y}`;
        }
    });
    
    // 実績線（赤色実線）
    let actualPath = '';
    days.forEach((day, i) => {
        const x = xScale(day);
        const y = yScale(actualCumulative[i]);
        if (i === 0) {
            actualPath += `M ${x} ${y}`;
        } else {
            actualPath += ` L ${x} ${y}`;
        }
    });
    
    // Y軸グリッド線とラベル
    const gridSteps = 5;
    let gridLines = '';
    let yLabels = '';
    for (let i = 0; i <= gridSteps; i++) {
        const value = (yMax / gridSteps) * i;
        const y = yScale(value);
        gridLines += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="#e5e7eb" stroke-width="0.5"/>`;
        yLabels += `<text x="${padding.left - 6}" y="${y + 4}" font-size="10" fill="#9ca3af" text-anchor="end">${Math.round(value)}</text>`;
    }
    
    // X軸日付ラベル
    let xLabels = '';
    const labelInterval = Math.max(1, Math.floor(days.length / 6));
    days.forEach((day, i) => {
        if (i % labelInterval === 0 || i === days.length - 1) {
            const x = xScale(day);
            const label = `${day.getMonth() + 1}/${day.getDate()}`;
            xLabels += `<text x="${x}" y="${height - 4}" font-size="10" fill="#9ca3af" text-anchor="middle">${label}</text>`;
        }
    });
    
    // 今日のマーカー
    let todayMarker = '';
    if (today >= minDate && today <= graphEnd) {
        const todayX = xScale(today);
        todayMarker = `<line x1="${todayX}" y1="${padding.top}" x2="${todayX}" y2="${graphHeight + padding.top}" stroke="#f59e0b" stroke-width="1" stroke-dasharray="3,3"/>`;
    }
    
    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            ${gridLines}
            ${yLabels}
            ${xLabels}
            ${todayMarker}
            <path d="${plannedPath}" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4,4"/>
            <path d="${actualPath}" fill="none" stroke="#ef4444" stroke-width="1.5"/>
        </svg>
    `;
}


/**
 * 進捗率に応じた色を取得
 */
function getProgressColor(progress) {
    if (progress >= 100) return '#10b981';
    if (progress >= 75) return '#3b82f6';
    if (progress >= 50) return '#0ea5e9';
    if (progress >= 25) return '#f59e0b';
    return '#ef4444';
}

/**
 * ラベルでフィルタしたチケット一覧を取得（アーカイブ含む）
 */
export function getTicketsByLabel(labelName) {
    return state.allTickets.filter(t =>
        t.labels && t.labels.includes(labelName)
    );
}

/**
 * 設定画面の担当者順番配列を取得
 */
function getAssigneeOrder() {
    try {
        if (typeof Settings !== 'undefined' && Settings.settings) {
            const s = Settings.settings();
            if (s && s.users && Array.isArray(s.users)) {
                return s.users.map(u => typeof u === 'string' ? u : u.name || u);
            }
        }
    } catch (e) {
        // Settings未初期化
    }
    return [];
}

/**
 * カラム順序（左側に表示する順）
 */
const COLUMN_ORDER = ['archive', 'done', 'doing', 'todo'];

/**
 * カラム名を表示用ラベルに変換
 */
function columnToLabel(column) {
    const map = { archive: 'Archive', done: 'Done', doing: 'Doing', todo: 'To Do' };
    return map[column] || column;
}

/**
 * 進捗マトリックス表を描画
 * 列: チケット名（カラム順 archive → done → doing → todo でソート）
 * 行: 担当者（設定画面の順番）
 */
export function renderProgressMatrix(container, labelName) {
    if (!container) return;
    
    const tickets = getTicketsByLabel(labelName);
    if (tickets.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">該当するチケットがありません</p>';
        return;
    }
    
    const assigneeOrder = getAssigneeOrder();
    
    // チケット名でグループ化（出現順保持）
    const titleMap = new Map();
    tickets.forEach(t => {
        const title = t.title || '無題';
        if (!titleMap.has(title)) {
            titleMap.set(title, []);
        }
        titleMap.get(title).push(t);
    });
    
    // カラム順 archive → done → doing → todo でソート
    // 同一タイトルで複数カラムに跨る場合は最初の出現カラムの順でソート
    const titles = Array.from(titleMap.keys()).sort((a, b) => {
        const aTickets = titleMap.get(a);
        const bTickets = titleMap.get(b);
        // 各タイトルの最小カラムインデックスを取得
        const aMinCol = Math.min(...aTickets.map(t => COLUMN_ORDER.indexOf(t.column || 'todo')));
        const bMinCol = Math.min(...bTickets.map(t => COLUMN_ORDER.indexOf(t.column || 'todo')));
        return aMinCol - bMinCol;
    });
    
    // 担当者を収集
    const assigneeSet = new Set();
    tickets.forEach(t => {
        if (t.assignees) {
            t.assignees.forEach(a => assigneeSet.add(a));
        }
    });
    
    // 設定画面の順番でソート
    const assignees = Array.from(assigneeSet).sort((a, b) => {
        const ia = assigneeOrder.indexOf(a);
        const ib = assigneeOrder.indexOf(b);
        return (ia >= 0 ? ia : Infinity) - (ib >= 0 ? ib : Infinity);
    });
    
    if (assignees.length === 0 || titles.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">データがありません</p>';
        return;
    }
    
    const table = document.createElement('table');
    table.className = 'progress-matrix-table';
    
    // ヘッダー
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const thName = document.createElement('th');
    thName.textContent = '担当者';
    headerRow.appendChild(thName);
    
    titles.forEach(title => {
        const th = document.createElement('th');
        const titleTickets = titleMap.get(title);
        // 複数カラムに跨る場合はカラム情報をヘッダーに表示
        const columns = new Set(titleTickets.map(t => t.column || 'todo'));
        if (columns.size > 1) {
            const sortedCols = Array.from(columns).sort((a, b) => COLUMN_ORDER.indexOf(a) - COLUMN_ORDER.indexOf(b));
            th.textContent = `${title} (${sortedCols.map(columnToLabel).join(', ')})`;
        } else {
            th.textContent = title;
        }
        th.title = title;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // 本文
    const tbody = document.createElement('tbody');
    assignees.forEach(assignee => {
        const tr = document.createElement('tr');
        const tdName = document.createElement('td');
        tdName.textContent = assignee;
        tdName.title = assignee;
        tr.appendChild(tdName);
        
        titles.forEach(title => {
            const td = document.createElement('td');
            const titleTickets = titleMap.get(title).filter(t =>
                t.assignees && t.assignees.includes(assignee)
            );
            
            if (titleTickets.length === 0) {
                const span = document.createElement('span');
                span.style.color = '#d1d5db';
                span.textContent = '—';
                td.appendChild(span);
            } else {
                const avgProgress = Math.round(
                    titleTickets.reduce((sum, t) => sum + (t.progress || 0), 0) / titleTickets.length
                );
                const color = getProgressColor(avgProgress);
                
                const cellDiv = document.createElement('div');
                cellDiv.className = 'progress-bar-cell';
                
                const barDiv = document.createElement('div');
                barDiv.className = 'progress-bar-mini';
                const fillDiv = document.createElement('div');
                fillDiv.className = 'progress-bar-mini-fill';
                fillDiv.style.width = avgProgress + '%';
                fillDiv.style.background = color;
                barDiv.appendChild(fillDiv);
                
                const textSpan = document.createElement('span');
                textSpan.className = 'progress-bar-text';
                textSpan.textContent = avgProgress + '%';
                
                cellDiv.appendChild(barDiv);
                cellDiv.appendChild(textSpan);
                td.appendChild(cellDiv);
            }
            
            tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    
    container.innerHTML = '';
    container.appendChild(table);
}


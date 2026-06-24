/**
 * グラフ描画モジュール
 * 進捗予実グラフと担当者累積工数グラフのSVG描画
 */

import { state, formatDateWithDay, getAllTickets } from './state.js';

// タイムライン行のカスタム順序（ドラッグで並び替え）
let timelineRowOrder = null;

// ===== 日付ユーティリティ =====

/**
 * YYYY-MM-DD 形式の文字列を 00:00:00 固定の Date に正規化
 */
function parseDate(dateStr) {
    if (!dateStr) return new Date(NaN);
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(NaN);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date(NaN);
    const date = new Date(y, m, d);
    if (isNaN(date.getTime())) return new Date(NaN);
    return date;
}

/**
 * 2日付の日数差を floor で計算（00:00正規化済み前提）
 */
function daysDiff(a, b) {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((a.getTime() - b.getTime()) / msPerDay);
}

/**
 * 今日を 00:00 固定で取得
 */
function getToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
}

/**
 * 数値のサニタイズ（NaN・空文字列 → 0）
 */
function sanitizeNum(val, fallback = 0) {
    if (val === null || val === undefined || val === '') return fallback;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

// ===== 個別チケット進捗グラフ =====

/**
 * 進捗履歴からグラフ用のポイントデータを抽出
 * @param {Array} histories - 履歴リスト
 * @returns {Array<{date: Date, progress: number}>} 日付順のポイントリスト
 */
function extractProgressPoints(histories) {
    if (!histories || !Array.isArray(histories)) return [];
    const points = [];
    for (const h of histories) {
        if (h.date && (h.type === 'progress' || h.type === 'childtask-progress')) {
            const dateStr = h.date.split('T')[0];
            const date = parseDate(dateStr);
            if (!isNaN(date.getTime())) {
                let progress = 0;
                if (h.type === 'progress') {
                    progress = sanitizeNum(h.value, 0);
                } else {
                    // childtask-progress: JSONからticketNewProgressを抽出
                    try {
                        const data = JSON.parse(h.value || '{}');
                        progress = sanitizeNum(data.ticketNewProgress, 0);
                    } catch (e) {
                        progress = 0;
                    }
                }
                points.push({ date, progress });
            }
        }
    }
    // 日付順にソート（同日の場合は進捗率の大きい方を残す）
    points.sort((a, b) => a.date.getTime() - b.date.getTime());
    // 同日の重複を除去（最後の値を保持）
    // toISOString() は UTC ベースなので日本時間でキーを生成
    const unique = [];
    const seenDates = new Set();
    for (const p of points) {
        const key = `${p.date.getFullYear()}-${String(p.date.getMonth() + 1).padStart(2, '0')}-${String(p.date.getDate()).padStart(2, '0')}`;
        if (!seenDates.has(key)) {
            seenDates.add(key);
            unique.push(p);
        } else {
            // 同日の場合は最後の値で上書き
            unique[unique.length - 1] = p;
        }
    }
    return unique;
}

/**
 * 個別チケットの進捗予実グラフを描画
 * @param {HTMLElement} container - グラフ配置コンテナ
 * @param {string} startDate - 開始日 (YYYY-MM-DD)
 * @param {string} endDate - 終了日 (YYYY-MM-DD)
 * @param {number} currentProgress - 現在の進捗率（外部から渡す）
 * @param {Array} histories - 進捗履歴リスト（オプション）
 */
export function renderProgressChart(container, startDate, endDate, currentProgress = 0, histories = []) {
    const width = 260;
    const height = 50;
    const labelHeight = 18;
    const padding = { top: 5, right: 20, bottom: 5, left: 20 };

    const start = parseDate(startDate);
    const end = parseDate(endDate);
    const today = getToday();

    // 無効日付の場合は描画しない
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:10px;font-size:12px;">日付データがありません</div>';
        return;
    }

    // グラフの右端は終了日と本日のうち遅い方
    const graphEnd = today > end ? today : end;

    currentProgress = sanitizeNum(currentProgress, 0);

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

    // 実績線: 履歴ベースの折れ線グラフ（履歴がない場合は従来の直線）
    let actualLine = '';
    const progressPoints = extractProgressPoints(histories);
    if (progressPoints.length > 0) {
        // 履歴データがある場合は折れ線グラフ
        let pathD = '';
        const circles = [];
        for (let i = 0; i < progressPoints.length; i++) {
            const p = progressPoints[i];
            const x = xScale(p.date);
            const y = yScale(p.progress);
            if (pathD === '') {
                pathD = `M ${x} ${y}`;
            } else {
                pathD += ` L ${x} ${y}`;
            }
            circles.push(`<circle cx="${x}" cy="${y}" r="2.5" fill="#ef4444"/>`);
        }
        if (pathD) {
            actualLine = `<path d="${pathD}" fill="none" stroke="#ef4444" stroke-width="1.5"/>${circles.join('')}`;
        }
    }
    if (!actualLine && today >= start) {
        // 履歴データがない場合は従来の直線
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

    // 日付ラベル — text-anchor修正（左端=start、右端=end）
    const startDateLabel = formatDateWithDay(start);
    const rightDateLabel = today > end ? formatDateWithDay(today) : formatDateWithDay(end);
    const dateLabels = `
        <text x="${padding.left}" y="${height + labelHeight - 2}" font-size="12" fill="#6b7280" text-anchor="start">${startDateLabel}</text>
        <text x="${width - padding.right}" y="${height + labelHeight - 2}" font-size="12" fill="#6b7280" text-anchor="end">${rightDateLabel}</text>
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

    // この担当者のチケットをフィルタ（アーカイブ除外・日付有効チェック）
    const assigneeTickets = getAllTickets().filter(t =>
        t.assignees && t.assignees.includes(assigneeName)
        && t.startDate && t.endDate
        && !t.isArchived
    ).map(t => ({
        ...t,
        _start: parseDate(t.startDate),
        _end: parseDate(t.endDate),
        _effort: sanitizeNum(t.effort, 0),
        _progress: sanitizeNum(t.progress, 0)
    })).filter(t => !isNaN(t._start.getTime()) && !isNaN(t._end.getTime()));

    // 日付キー生成関数（toISOString のタイムゾーンずれ回避）
    function dateKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
    }

    if (assigneeTickets.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#9ca3af;padding:20px;font-size:12px;">データがありません</div>';
        return;
    }

    const today = getToday();

    // 全チケットの開始日・終了日からグラフの範囲を計算
    let minDate = assigneeTickets[0]._start;
    let maxDate = assigneeTickets[0]._end;

    assigneeTickets.forEach(t => {
        if (t._start < minDate) minDate = t._start;
        if (t._end > maxDate) maxDate = t._end;
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

    // 日リスト生成（00:00正規化済み）
    const days = [];
    const current = new Date(minDate);
    while (current <= graphEnd) {
        days.push(new Date(current));
        current.setDate(current.getDate() + 1);
    }

    // 予定累積・実績累積を計算
    // 実績モデル: effort * progress / 100 を単純に日割り（バーンインモデル）
    const plannedCumulative = [];
    const actualCumulative = [];
    let totalPlanned = 0;
    let totalActual = 0;

    days.forEach(day => {
        assigneeTickets.forEach(ticket => {
            const { _start, _end, _effort, _progress } = ticket;

            // 予定: 期間中の日ごとに均等配分
            if (day >= _start && day <= _end) {
                const durationDays = Math.max(1, daysDiff(_end, _start) + 1);
                const dailyEffort = _effort / durationDays;
                totalPlanned += dailyEffort;
            }

            // 実績: 経過日ベースのバーンインモデル
            // 実績分を「開始日〜today」の経過日で配分
            if (day <= today && day >= _start && day <= _end) {
                const actualEffort = _effort * (_progress / 100);
                const elapsedDays = Math.max(1, daysDiff(
                    day < today ? day : today,
                    _start
                ) + 1);
                const dailyActual = actualEffort / elapsedDays;
                totalActual += dailyActual;
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
    if (progress >= 50) return '#3b82f6';
    if (progress >= 25) return '#f59e0b';
    return '#ef4444';
}

/**
 * ラベルでフィルタしたチケット一覧を取得（アーカイブ含む）
 */
export function getTicketsByLabel(labelName) {
    return getAllTickets().filter(t =>
        t.labels && t.labels.includes(labelName)
    );
}

/**
 * 設定画面の担当者順番配列を取得
 * window.Settings を使用（settings.js がグローバル公開）
 */
function getAssigneeOrder() {
    try {
        const s = getSettingsInternal();
        if (s && s.users && Array.isArray(s.users)) {
            return s.users.map(u => typeof u === 'string' ? u : u.name || u);
        }
    } catch (e) {
        // Settings未初期化
    }
    return [];
}

/**
 * 設定データを取得（内部用）
 * window.Settings を使用（settings.js がグローバル公開）
 */
function getSettingsInternal() {
    try {
        if (typeof window.Settings !== 'undefined' && window.Settings.settings) {
            return window.Settings.settings();
        }
    } catch (e) {}
    return null;
}

/**
 * 指定日が休日（土日・設定休日）かどうかを判定
 */
function isHoliday(date) {
    const day = date.getDay();
    if (day === 0 || day === 6) return true;
    const settings = getSettingsInternal();
    if (settings && settings.holidays) {
        const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        if (settings.holidays.includes(dateStr)) return true;
    }
    return false;
}

/**
 * 期間中の作業日（休日除外）のリストを生成
 */
function getWorkDays(startDate, endDate) {
    const start = parseDate(startDate);
    const end = parseDate(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
    const days = [];
    const current = new Date(start);
    while (current <= end) {
        if (!isHoliday(current)) {
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}

/**
 * カラム順序（左側に表示する順）
 */
const COLUMN_ORDER = ['archive', 'done', 'doing', 'todo'];

// 子タスク表示のトグル状態管理 (title -> boolean)
// title重複回避のため、title + チケットリストのハッシュをキーに使用
const childTaskVisibility = new Map();

// 進捗マトリックス表の列順序（カスタム並び替え用）
let progressMatrixColumnOrder = null;

/**
 * 進捗マトリックス表を描画
 * 列: チケット名 + 子タスク（カラム順 archive → done → doing → todo でソート）
 * 行: 担当者（設定画面の順番）
 * メインタスクヘッダークリックで子タスク列の表示/非表示をトグル
 */
export function renderProgressMatrix(container, labelName, excludedTicketIds = []) {
    if (!container) {
        console.warn('renderProgressMatrix: container is null');
        return;
    }
    
    let tickets = getTicketsByLabel(labelName);
    // 除外チケットをフィルタ（IDを数値で比較）
    if (excludedTicketIds.length > 0) {
        const excludedNumIds = excludedTicketIds.map(id => Number(id));
        tickets = tickets.filter(t => !excludedNumIds.includes(Number(t.id)));
    }
    if (tickets.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">該当するチケットがありません</p>';
        return;
    }
    
    const assigneeOrder = getAssigneeOrder();
    
    // カテゴリでグループ化（カテゴリ未設定の場合はチケットタイトルを使用）
    const categoryMap = new Map();
    tickets.forEach(t => {
        const category = t.category || (t.title || '無題');
        if (!categoryMap.has(category)) {
            categoryMap.set(category, []);
        }
        categoryMap.get(category).push(t);
    });
    
    // カスタム列順序がある場合はそれを使用、なければ進捗率順でソート
    let categories;
    if (progressMatrixColumnOrder !== null && progressMatrixColumnOrder.length > 0) {
        // カスタム順序でソート（新規カテゴリは末尾に追加）
        categories = Array.from(categoryMap.keys()).sort((a, b) => {
            const aIdx = progressMatrixColumnOrder.indexOf(a);
            const bIdx = progressMatrixColumnOrder.indexOf(b);
            const aFallback = (aIdx >= 0) ? aIdx : Infinity;
            const bFallback = (bIdx >= 0) ? bIdx : Infinity;
            if (aFallback !== bFallback) return aFallback - bFallback;
            // 両方とも新規の場合は進捗率順
            const aTickets = categoryMap.get(a);
            const bTickets = categoryMap.get(b);
            const aAvg = aTickets.reduce((sum, t) => sum + sanitizeNum(t.progress, 0), 0) / aTickets.length;
            const bAvg = bTickets.reduce((sum, t) => sum + sanitizeNum(t.progress, 0), 0) / bTickets.length;
            return bAvg - aAvg;
        });
    } else {
        // 対象者全員の平均進捗率の高い順でソート（子タスクはタスク内だけでソート）
        categories = Array.from(categoryMap.keys()).sort((a, b) => {
            const aTickets = categoryMap.get(a);
            const bTickets = categoryMap.get(b);
            // 各カテゴリの全チケットの平均進捗率を計算
            const aAvgProgress = aTickets.reduce((sum, t) => sum + sanitizeNum(t.progress, 0), 0) / aTickets.length;
            const bAvgProgress = bTickets.reduce((sum, t) => sum + sanitizeNum(t.progress, 0), 0) / bTickets.length;
            // 進捗率の高い順（降順）。同率の場合はカラム順でソート
            if (Math.abs(aAvgProgress - bAvgProgress) > 0.01) {
                return bAvgProgress - aAvgProgress;
            }
            // 同率の場合はカラム順 archive → done → doing → todo でソート
            const aMinCol = Math.min(...aTickets.map(t => COLUMN_ORDER.indexOf(t.column || 'todo')));
            const bMinCol = Math.min(...bTickets.map(t => COLUMN_ORDER.indexOf(t.column || 'todo')));
            return aMinCol - bMinCol;
        });
    }
    
    // 各カテゴリの子タスクを収集（重複除去、done=false のみ）
    // 同じ名前の子タスクは1列に統合（text + category で重複除去）
    const categoryChildTasks = new Map();
    categories.forEach(category => {
        const categoryTickets = categoryMap.get(category);
        const childSet = new Map(); // text+category -> childTask（最初に見つかったものを保持）
        categoryTickets.forEach(t => {
            if (t.childTasks && Array.isArray(t.childTasks)) {
                t.childTasks.forEach(ct => {
                    const ctCategory = ct.category || category;
                    const key = `${ctCategory}::${ct.text || '無題'}`;
                    if (!ct.done && !childSet.has(key)) {
                        childSet.set(key, ct);
                    }
                });
            }
        });
        categoryChildTasks.set(category, Array.from(childSet.values()));
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
    
    console.log(`renderProgressMatrix: categories=${categories.length}, assignees=${assignees.length}`);
    if (assignees.length === 0 || categories.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">データがありません</p>';
        console.log('renderProgressMatrix: no assignees or categories');
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
    
    categories.forEach(category => {
        const childTasks = categoryChildTasks.get(category) || [];
        const hasChildren = childTasks.length > 0;
        
        // カテゴリ重複回避のため、カテゴリ+チケット数のハッシュをキーに使用
        const visibilityKey = `${category}::${categoryMap.get(category).length}`;
        
        // メインタスクヘッダー
        const th = document.createElement('th');
        th.className = hasChildren ? 'main-task-header clickable draggable-column-header' : 'main-task-header draggable-column-header';
        th.textContent = category;
        th.title = category + '（ドラッグで列入れ替え）';
        th.draggable = true;
        th.dataset.columnTitle = category;
        if (hasChildren) {
            const prefixSpan = document.createElement('span');
            prefixSpan.className = 'child-toggle-icon';
            const visible = childTaskVisibility.get(visibilityKey) || false;
            prefixSpan.textContent = visible ? '▾' : '▸';
            prefixSpan.title = visible ? '子タスクを非表示' : '子タスクを表示';
            th.prepend(prefixSpan);
        }
        headerRow.appendChild(th);
        
        // 子タスクヘッダー（デフォルト非表示）
        childTasks.forEach(ct => {
            const childTh = document.createElement('th');
            childTh.className = 'child-task-header';
            childTh.dataset.parentTitle = category;
            const ctCategory = ct.category || category;
            childTh.textContent = ctCategory ? `[${ctCategory}] ${ct.text || '無題'}` : (ct.text || '無題');
            childTh.title = ct.text || '無題';
            if (!childTaskVisibility.get(visibilityKey)) {
                childTh.style.display = 'none';
            }
            headerRow.appendChild(childTh);
        });
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
        
        categories.forEach(category => {
            // メインタスクセル
            const td = document.createElement('td');
            const categoryTickets = categoryMap.get(category).filter(t =>
                t.assignees && t.assignees.includes(assignee)
            );
            
            if (categoryTickets.length === 0) {
                const span = document.createElement('span');
                span.style.color = '#d1d5db';
                span.textContent = '—';
                td.appendChild(span);
            } else {
                const avgProgress = Math.round(
                    categoryTickets.reduce((sum, t) => sum + sanitizeNum(t.progress, 0), 0) / categoryTickets.length
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
            
            // 子タスクセル
            const childTasks = categoryChildTasks.get(category) || [];
            const visibilityKey = `${category}::${categoryMap.get(category).length}`;
            childTasks.forEach(ct => {
                const childTd = document.createElement('td');
                childTd.className = 'child-task-cell';
                childTd.dataset.parentTitle = category;
                
                // 子タスクの進捗率を表示
                // 該当チケットから同じカテゴリ+名前の子タスクを探す
                let childProgress = null;
                const ctKey = `${ct.category || category}::${ct.text || '無題'}`;
                for (const t of categoryTickets) {
                    if (t.childTasks) {
                        const ctCat = ct.category || category;
                        const found = t.childTasks.find(c => {
                            const cCat = c.category || category;
                            return cCat === ctCat && (c.text || '無題') === (ct.text || '無題');
                        });
                        if (found) {
                            childProgress = found.progress;
                            break;
                        }
                    }
                }
                
                if (childProgress === null) {
                    const span = document.createElement('span');
                    span.style.color = '#d1d5db';
                    span.textContent = '—';
                    childTd.appendChild(span);
                } else {
                    const color = getProgressColor(childProgress);
                    const cellDiv = document.createElement('div');
                    cellDiv.className = 'progress-bar-cell';
                    
                    const barDiv = document.createElement('div');
                    barDiv.className = 'progress-bar-mini';
                    const fillDiv = document.createElement('div');
                    fillDiv.className = 'progress-bar-mini-fill';
                    fillDiv.style.width = childProgress + '%';
                    fillDiv.style.background = color;
                    barDiv.appendChild(fillDiv);
                    
                    const textSpan = document.createElement('span');
                    textSpan.className = 'progress-bar-text';
                    textSpan.textContent = childProgress + '%';
                    
                    cellDiv.appendChild(barDiv);
                    cellDiv.appendChild(textSpan);
                    childTd.appendChild(cellDiv);
                }
                
                if (!childTaskVisibility.get(visibilityKey)) {
                    childTd.style.display = 'none';
                }
                
                tr.appendChild(childTd);
            });
        });
        
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    
    // 列ヘッダーのドラッグ＆ドロップで列入れ替え（クリックイベントもここで統合）
    const draggableHeaders = table.querySelectorAll('.draggable-column-header');
    let draggedHeader = null;
    
    draggableHeaders.forEach(header => {
        let wasDragging = false;
        
        header.addEventListener('dragstart', (e) => {
            draggedHeader = header;
            wasDragging = true;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', header.dataset.columnTitle);
            const ghost = document.createElement('span');
            ghost.textContent = '↔';
            ghost.style.fontSize = '24px';
            ghost.style.color = '#3b82f6';
            e.dataTransfer.setDragImage(ghost, 12, 12);
            setTimeout(() => header.classList.add('dragging'), 0);
        });
        
        header.addEventListener('dragend', () => {
            header.classList.remove('dragging');
            draggableHeaders.forEach(h => h.classList.remove('drag-over-left', 'drag-over-right'));
            draggedHeader = null;
        });
        
        header.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (draggedHeader === header) return;
            
            const rect = header.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            header.classList.remove('drag-over-left', 'drag-over-right');
            if (e.clientX < midX) {
                header.classList.add('drag-over-left');
            } else {
                header.classList.add('drag-over-right');
            }
        });
        
        header.addEventListener('dragleave', () => {
            header.classList.remove('drag-over-left', 'drag-over-right');
        });
        
        header.addEventListener('drop', (e) => {
            e.preventDefault();
            if (draggedHeader === header) return;
            
            const rect = header.getBoundingClientRect();
            const midX = rect.left + rect.width / 2;
            const insertBefore = e.clientX < midX;
            
            const draggedTitle = draggedHeader.dataset.columnTitle;
            const targetTitle = header.dataset.columnTitle;
            
            if (progressMatrixColumnOrder === null) {
                progressMatrixColumnOrder = [...categories];
            }
            
            const dragIdx = progressMatrixColumnOrder.indexOf(draggedTitle);
            const targetIdx = progressMatrixColumnOrder.indexOf(targetTitle);
            if (dragIdx < 0 || targetIdx < 0) return;
            
            progressMatrixColumnOrder.splice(dragIdx, 1);
            let newTargetIdx = progressMatrixColumnOrder.indexOf(targetTitle);
            if (!insertBefore) {
                newTargetIdx += 1;
            }
            progressMatrixColumnOrder.splice(newTargetIdx, 0, draggedTitle);
            
            header.classList.remove('drag-over-left', 'drag-over-right');
            
            // 再描画
            renderProgressMatrix(container, labelName, excludedTicketIds);
        });
        
        header.addEventListener('click', (e) => {
            // ドラッグだった場合はクリック処理をスキップ
            if (wasDragging) {
                wasDragging = false;
                return;
            }
//            const title = header.title.replace('（ドラッグで列入れ替え）', '');
//            const titleTickets = titleMap.get(title);
//            if (!titleTickets) return;

            const title = header.dataset.columnTitle;
            const titleTickets = title ? categoryMap.get(title) : null;
            if (!title || !titleTickets) return;

            const childTasks = categoryChildTasks.get(title) || [];
            if (childTasks.length === 0) return;

            const visibilityKey = `${title}::${titleTickets.length}`;
            const isVisible = childTaskVisibility.get(visibilityKey) || false;
            childTaskVisibility.set(visibilityKey, !isVisible);
            
            const icon = header.querySelector('.child-toggle-icon');
            if (icon) {
                icon.textContent = !isVisible ? '▾' : '▸';
                icon.title = !isVisible ? '子タスクを非表示' : '子タスクを表示';
            }
            
            table.querySelectorAll(`[data-parent-title="${title}"]`).forEach(cell => {
                cell.style.display = !isVisible ? '' : 'none';
            });
        });
    });
    
    container.innerHTML = '';
    container.appendChild(table);
    console.log('renderProgressMatrix: table appended successfully');
}

/**
 * タイムラインビュー（Gantt風）を描画
 * 縦軸: 担当者（設定画面の順番）
 * 横軸: 作業日（土日・休日除外）
 */
export function renderTimelineView(container, labelName, excludedTicketIds = []) {
    if (!container) return;

    let tickets = getTicketsByLabel(labelName);
    if (excludedTicketIds.length > 0) {
        const excludedNumIds = excludedTicketIds.map(id => Number(id));
        tickets = tickets.filter(t => !excludedNumIds.includes(Number(t.id)));
    }

    if (tickets.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">該当するチケットがありません</p>';
        return;
    }

    // 担当者収集
    const assigneeSet = new Set();
    tickets.forEach(t => {
        if (t.assignees) t.assignees.forEach(a => assigneeSet.add(a));
    });
    const assigneeOrder = getAssigneeOrder();
    const assignees = Array.from(assigneeSet).sort((a, b) => {
        const ia = assigneeOrder.indexOf(a);
        const ib = assigneeOrder.indexOf(b);
        return (ia >= 0 ? ia : Infinity) - (ib >= 0 ? ib : Infinity);
    });

    if (assignees.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">データがありません</p>';
        return;
    }

    // 日付があるチケットとないチケットを分離
    const ticketsWithDates = [];
    const ticketsWithoutDates = [];
    tickets.forEach(t => {
        const start = parseDate(t.startDate);
        const end = parseDate(t.endDate);
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            ticketsWithDates.push(t);
        } else {
            ticketsWithoutDates.push(t);
        }
    });

    // 日付がある場合はGanttチャート表示
    if (ticketsWithDates.length > 0) {
        renderGanttChart(container, ticketsWithDates, assignees);
    }

    // 日付なしチケットがある場合はテーブルも表示
    if (ticketsWithoutDates.length > 0) {
        renderTimelineTable(container, ticketsWithoutDates, assignees);
    }

    // 有効な情報がない場合はメッセージを表示
    if (ticketsWithDates.length === 0 && ticketsWithoutDates.length === 0) {
        container.innerHTML = '<p class="graph-placeholder">有効な情報がありません</p>';
    }
}

/**
 * Ganttチャート表示（横軸=日付、縦軸=担当者）
 */
// 担当者別カラーパレット
const ASSIGNEE_COLORS = [
  { light: '#bfdbfe', dark: '#3b82f6' },  // 青
  { light: '#bbf7d0', dark: '#22c55e' },  // 緑
  { light: '#fed7aa', dark: '#f97316' },  // オレンジ
  { light: '#e9d5ff', dark: '#a855f7' },  // 紫
  { light: '#fecaca', dark: '#ef4444' },  // 赤
  { light: '#a5f3fc', dark: '#06b6d4' },  // シアン
  { light: '#fde68a', dark: '#eab308' },  // 黄
  { light: '#fca5a5', dark: '#dc2626' },  // 濃い赤
];

function getAssigneeColor(assigneeIndex) {
    return ASSIGNEE_COLORS[assigneeIndex % ASSIGNEE_COLORS.length];
}

function renderGanttChart(container, tickets, assignees) {
    // 全期間の最小/最大日付
    let globalMinDate = null, globalMaxDate = null;
    tickets.forEach(t => {
        const s = parseDate(t.startDate);
        const e = parseDate(t.endDate);
        if (!isNaN(s.getTime())) {
            if (!globalMinDate || s < globalMinDate) globalMinDate = s;
        }
        if (!isNaN(e.getTime())) {
            if (!globalMaxDate || e > globalMaxDate) globalMaxDate = e;
        }
    });

    if (!globalMinDate || !globalMaxDate) return;

    // 作業日リストと日付→インデックスマップ
    const workDays = [];
    const dateToIndex = new Map();
    const current = new Date(globalMinDate);
    let index = 0;
    while (current <= globalMaxDate) {
        if (!isHoliday(current)) {
            workDays.push(new Date(current));
            const key = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
            dateToIndex.set(key, index);
            index++;
        }
        current.setDate(current.getDate() + 1);
    }

    if (workDays.length === 0) return;

    // 担当者×チケットの行リストを生成
    const allRows = [];
    assignees.forEach((assignee, assigneeIdx) => {
        let assigneeTickets = tickets.filter(t =>
            t.assignees && t.assignees.includes(assignee)
        );
        // 同じ担当者のチケットを並べ替え（開始日昇順 → 終了日昇順）
        assigneeTickets.sort((a, b) => {
            const aStart = parseDate(a.startDate);
            const bStart = parseDate(b.startDate);
            const aStartValid = !isNaN(aStart.getTime());
            const bStartValid = !isNaN(bStart.getTime());
            if (aStartValid && bStartValid) {
                if (aStart.getTime() !== bStart.getTime()) {
                    return aStart.getTime() - bStart.getTime();
                }
                const aEnd = parseDate(a.endDate);
                const bEnd = parseDate(b.endDate);
                if (!isNaN(aEnd.getTime()) && !isNaN(bEnd.getTime())) {
                    return aEnd.getTime() - bEnd.getTime();
                }
            }
            return 0;
        });
        assigneeTickets.forEach(ticket => {
            allRows.push({
                assignee,
                assigneeIdx,
                ticket,
                label: `${assignee} - ${ticket.title || '無題'}`,
                key: `${assignee}|${ticket.id}`
            });
        });
    });

    if (allRows.length === 0) return;

    // カスタム行順序がある場合は適用
    let rows = allRows;
    if (timelineRowOrder !== null && timelineRowOrder.length > 0) {
        const rowMap = new Map();
        allRows.forEach(r => rowMap.set(r.key, r));
        const ordered = [];
        timelineRowOrder.forEach(key => {
            if (rowMap.has(key)) {
                ordered.push(rowMap.get(key));
            }
        });
        // 新規行は末尾に追加
        allRows.forEach(r => {
            if (!timelineRowOrder.includes(r.key)) {
                ordered.push(r);
            }
        });
        rows = ordered;
    }

    // パラメータ
    const rowHeight = 28;
    const dayWidth = 30;
    const barHeight = 16;
    const leftPadding = 160;
    const topPadding = 25;

    // コンテナ作成
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-container';

    // グリッドコンテナ
    const grid = document.createElement('div');
    grid.className = 'timeline-grid';
    grid.style.gridTemplateColumns = `${leftPadding}px repeat(${workDays.length}, ${dayWidth}px)`;
    grid.style.gridTemplateRows = `${topPadding}px repeat(${rows.length}, ${rowHeight}px)`;

    // 日付ラベル行（row 1）
    const labelInterval = Math.max(1, Math.floor(workDays.length / 15));
    workDays.forEach((day, i) => {
        const cell = document.createElement('div');
        cell.className = 'timeline-date-cell';
        cell.style.gridColumn = i + 2;
        cell.style.gridRow = 1;
        if (i % labelInterval === 0 || i === workDays.length - 1) {
            cell.textContent = `${day.getMonth() + 1}/${day.getDate()}`;
        } else {
            cell.classList.add('empty');
        }
        grid.appendChild(cell);
    });

    // 担当者 - チケット行（row 2〜）
    const assigneeCells = [];
    rows.forEach((rowInfo, row) => {
        const gridRow = row + 2;

        // 担当者名セル（「山田 - aaa」形式）
        const assigneeCell = document.createElement('div');
        assigneeCell.className = 'timeline-assignee-cell draggable-timeline-row';
        assigneeCell.textContent = rowInfo.label;
        assigneeCell.title = rowInfo.label + '（ドラッグで入れ替え）';
        assigneeCell.style.gridColumn = 1;
        assigneeCell.style.gridRow = gridRow;
        assigneeCell.draggable = true;
        assigneeCell.dataset.rowKey = rowInfo.key;
        assigneeCells.push(assigneeCell);
        grid.appendChild(assigneeCell);

        // 日付セル（バー配置用）
        workDays.forEach((_, i) => {
            const cell = document.createElement('div');
            cell.className = 'timeline-cell';
            cell.style.gridColumn = i + 2;
            cell.style.gridRow = gridRow;
            grid.appendChild(cell);
        });
    });

     // 今日マーカー
    const today = getToday();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    if (dateToIndex.has(todayKey)) {
        const todayIndex = dateToIndex.get(todayKey);
        const todayLine = document.createElement('div');
        todayLine.className = 'timeline-today-line';
        todayLine.style.left = `${leftPadding + todayIndex * dayWidth + dayWidth / 2}px`;
        todayLine.style.height = `${rows.length * rowHeight}px`;
        todayLine.style.top = `${topPadding}px`;
        wrapper.appendChild(todayLine);
    }

    // チケットバー（予定＋実績）
    rows.forEach((rowInfo, row) => {
        const ticket = rowInfo.ticket;
        const start = parseDate(ticket.startDate);
        const end = parseDate(ticket.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

        const progress = Math.min(100, Math.max(0, sanitizeNum(ticket.progress, 0)));
        const colors = getAssigneeColor(rowInfo.assigneeIdx);

        const startKey = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
        const endKey = `${end.getFullYear()}-${String(end.getMonth()+1).padStart(2,'0')}-${String(end.getDate()).padStart(2,'0')}`;
        const startIndex = dateToIndex.has(startKey) ? dateToIndex.get(startKey) : -1;
        const endIndex = dateToIndex.has(endKey) ? dateToIndex.get(endKey) : -1;

        if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return;

        const totalDays = endIndex - startIndex + 1;
        const gridColStart = startIndex + 2;
        const gridColSpan = totalDays;
        const gridRowVal = row + 2;

        // 予定バー（薄い色の長方形）
        const plannedBar = document.createElement('div');
        plannedBar.className = 'timeline-bar-planned';
        plannedBar.style.gridColumn = `${gridColStart} / span ${gridColSpan}`;
        plannedBar.style.gridRow = gridRowVal;
        plannedBar.style.background = colors.light;
        plannedBar.style.height = `${barHeight}px`;
        plannedBar.title = `${ticket.title} 予定 (${progress}%)`;
        grid.appendChild(plannedBar);

        // 実績バー（濃い色の長方形 - 進捗率に応じて幅を計算）
        if (progress > 0) {
            const totalBarWidth = totalDays * dayWidth;
            const actualWidth = Math.round(totalBarWidth * progress / 100);
            const actualBar = document.createElement('div');
            actualBar.className = 'timeline-bar-actual';
            actualBar.style.gridColumn = `${gridColStart} / span ${totalDays}`;
            actualBar.style.gridRow = gridRowVal;
            actualBar.style.background = colors.dark;
            actualBar.style.height = `${barHeight}px`;
            actualBar.style.width = `${actualWidth}px`;
            actualBar.title = `${ticket.title} 実績 (${progress}%)`;

            if (actualWidth > 40) {
                actualBar.textContent = `${progress}%`;
            }

            grid.appendChild(actualBar);
        }
    });

    wrapper.appendChild(grid);
    container.innerHTML = '';
    container.appendChild(wrapper);
}

/**
 * 日付なしチケットのテーブル表示
 */
function renderTimelineTable(container, tickets, assignees) {
    if (tickets.length === 0) return;

    let html = '<div class="timeline-no-date-section"><h4>日付未設定のチケット</h4>';
    html += '<table class="progress-matrix-table">';
    html += '<thead><tr><th>チケット</th><th>担当者</th><th>進捗</th></tr></thead>';
    html += '<tbody>';
    tickets.forEach(t => {
        const progress = sanitizeNum(t.progress, 0);
        const color = getProgressColor(progress);
        const assigneeText = t.assignees ? t.assignees.map(escapeHtml).join(', ') : '—';
        html += `<tr>
            <td>${escapeHtml(t.title)}</td>
            <td>${assigneeText}</td>
            <td><span class="progress-badge" style="background-color:${color}">${progress}%</span></td>
        </tr>`;
    });
    html += '</tbody></table></div>';
    container.innerHTML += html;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, "\u0026#39;");
}

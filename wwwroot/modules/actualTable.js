// 実績入力表モジュール

import { getAllTickets, getSettings, API_BASE } from './state.js';
import { api } from './api.js';
import { loadUserSettings, updateActualSettingsSync } from './userSettings.js';
import { showActualProgressPopup } from './progressSliderPopup.js';
import { getToken } from './auth.js';
import { openEditModal } from './modal.js';
import { escapeHtml } from './utils/escapeHtml.js';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 日本時間に基づいた今日の日付を取得（9時を境目）
 * 9時以降は当日、9時前は前日
 */
function getJapanDateWithCutoff() {
    // 日本時間 (UTC+9)
    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    
    // 9時を境目
    const hours = jst.getUTCHours();
    const date = new Date(jst);
    if (hours < 9) {
        date.setDate(date.getDate() - 1);
    }
    return date;
}

/**
 * 設定から休日セットを取得（yyyyMMdd形式）
 */
function getHolidaySet() {
    const settings = getSettings();
    const holidaySet = new Set();
    if (settings && settings.holidays) {
        settings.holidays.forEach(h => holidaySet.add(h));
    }
    return holidaySet;
}

/**
 * 日付が土日または祝日かどうかをチェック
 */
function isWeekendOrHoliday(date, holidaySet) {
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) return true; // 土日
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const holidayKey = `${y}${m}${d}`;
    return holidaySet.has(holidayKey);
}

let selectedColumns = new Set(['todo', 'doing', 'done']);
let actualDataCache = {};
let showHolidays = false;
let initialized = false;

export function initActualTable(onFilterChange) {
    const overlay = document.getElementById('actualModalOverlay');
    const assigneeSelect = document.getElementById('actualTableAssigneeSelect');
    const monthInput = document.getElementById('actualTableMonthInput');

    // 既に初期化済みならイベントリスナー設定はスキップ
    if (initialized) {
        restoreActualState();
        // キャッシュをクリアして毎回APIから再取得
        actualDataCache = {};
        renderTable();
        return;
    }
    initialized = true;

    // ESCキーで閉じる
    overlay?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            overlay.classList.remove('active');
            saveActualState();
        }
    });

    // 画面外（overlay）クリックで閉じる
    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            saveActualState();
        }
    });

    // 担当者ドロップダウンにフィルタ変更イベントを登録
    assigneeSelect?.addEventListener('change', () => {
        saveActualState();
        renderTable();
    });

    // 対象月
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthInput.value = currentMonth;
    monthInput?.addEventListener('change', () => {
        saveActualState();
        renderTable();
    });

    // 休日を表示チェックボックス
    const showHolidaysCheckbox = document.getElementById('actualShowHolidays');
    showHolidaysCheckbox?.addEventListener('change', () => {
        showHolidays = showHolidaysCheckbox.checked;
        saveActualState();
        renderTable();
    });

    // 保存された状態を復元（ドロップダウン初期化前に復元）
    restoreActualState();

    // 対象ドロップダウン（カスタム）- 状態復元後に初期化してチェックボックスを同期
    initColumnDropdown();

    // 初期描画
    renderTable();
}

/**
 * 実績入力画面の状態をlocalStorageに保存
 */
export function saveActualState() {
    const assigneeSelect = document.getElementById('actualTableAssigneeSelect');
    const monthInput = document.getElementById('actualTableMonthInput');
    updateActualSettingsSync({
        visible: document.getElementById('actualModalOverlay')?.classList.contains('active') || false,
        assignee: assigneeSelect?.value || '',
        columns: Array.from(selectedColumns),
        month: monthInput?.value || '',
        showHolidays
    });
}

/**
 * localStorageから実績入力画面の状態を復元
 */
function restoreActualState() {
    const settings = loadUserSettings();
    const actual = settings.actual;
    if (!actual) return;

    const assigneeSelect = document.getElementById('actualTableAssigneeSelect');
    const monthInput = document.getElementById('actualTableMonthInput');

    if (assigneeSelect && actual.assignee) {
        assigneeSelect.value = actual.assignee;
    }
    if (monthInput && actual.month) {
        monthInput.value = actual.month;
    }
    if (actual.columns && Array.isArray(actual.columns)) {
        selectedColumns = new Set(actual.columns);
        updateDropdownButton();
        // チェックボックスの状態も更新
        const checkboxes = document.querySelectorAll('#actualColumnList input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = selectedColumns.has(cb.value);
        });
    }
    if (actual.showHolidays !== undefined) {
        showHolidays = actual.showHolidays;
        const checkbox = document.getElementById('actualShowHolidays');
        if (checkbox) checkbox.checked = showHolidays;
    }
}

function initColumnDropdown() {
    const toggleBtn = document.getElementById('actualColumnToggleBtn');
    const list = document.getElementById('actualColumnList');
    const columns = [
        { value: 'todo', label: 'TODO' },
        { value: 'doing', label: 'DOING' },
        { value: 'done', label: 'DONE' },
        { value: 'archive', label: 'Archive' }
    ];

    // チェックボックスリストを作成
    list.innerHTML = '';
    columns.forEach(col => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.innerHTML = `<input type="checkbox" value="${col.value}" ${selectedColumns.has(col.value) ? 'checked' : ''}> ${col.label}`;
        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                selectedColumns.add(col.value);
            } else {
                selectedColumns.delete(col.value);
            }
            saveActualState();
            updateDropdownButton();
            renderTable();
        });
        list.appendChild(item);
    });

    // ドロップダウンのトグル
    toggleBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        list.style.display = list.style.display === 'block' ? 'none' : 'block';
    });

    // クリックで閉じる
    document.addEventListener('click', () => {
        list.style.display = 'none';
    });
    list.addEventListener('click', (e) => e.stopPropagation());

    updateDropdownButton();
}

function updateDropdownButton() {
    const toggleBtn = document.getElementById('actualColumnToggleBtn');
    const labels = [];
    if (selectedColumns.has('todo')) labels.push('TODO');
    if (selectedColumns.has('doing')) labels.push('DOING');
    if (selectedColumns.has('done')) labels.push('DONE');
    if (selectedColumns.has('archive')) labels.push('Archive');
    toggleBtn.textContent = labels.length > 0 ? labels.join(', ') + ' ▼' : '対象を選択 ▼';
}

async function renderTable() {
    const assigneeSelect = document.getElementById('actualTableAssigneeSelect');
    const monthInput = document.getElementById('actualTableMonthInput');
    const container = document.getElementById('actualTableContainer');

    const assignee = assigneeSelect.value;
    const month = monthInput.value;
    if (!month) return;

    // ローディング表示
    const loadingEl = document.getElementById('actualTableLoading');
    if (loadingEl) loadingEl.classList.remove('hidden');

    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr);
    const monthNum = parseInt(monthStr);
    const daysInMonth = new Date(year, monthNum, 0).getDate();

    // チケットを取得
    let tickets = getAllTickets();
    if (assignee) {
        tickets = tickets.filter(t => {
            // assignees配列に含まれるか、mainAssigneeが一致するか
            return (t.assignees && t.assignees.includes(assignee)) || t.mainAssignee === assignee;
        });
    }
    // カラムフィルタ
    if (selectedColumns.size > 0) {
        tickets = tickets.filter(t => selectedColumns.has(t.column));
    }

    // 実績データを取得
    await fetchAllActualsForMonth(year, monthNum, daysInMonth, tickets);

    // 休日セットを取得
    const holidaySet = getHolidaySet();

    // 日表示対象を決定（休日を表示ON=全日、OFF=営業日のみ）
    const displayDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthNum - 1, day);
        if (showHolidays || !isWeekendOrHoliday(date, holidaySet)) {
            displayDays.push(day);
        }
    }

    // 表を生成
    let html = '<table class="actual-table"><thead><tr><th class="row-header">チケット / 日付</th>';

    // 日付ヘッダー
    for (const day of displayDays) {
        const date = new Date(year, monthNum - 1, day);
        const dayOfWeek = date.getDay();
        const isFriday = dayOfWeek === 5;
        const isMonday = dayOfWeek === 1;

        let classes = 'day-header';
        if (isFriday) classes += ' friday-border';
        if (isMonday) classes += ' monday-indent';

        const color = getDayColor(dayOfWeek);
        html += `<th class="${classes}" style="color:${color}">${day}<span class="day-name">${DAY_NAMES[dayOfWeek]}</span></th>`;
    }
    html += '</tr></thead><tbody>';

    // チケット行
    for (const ticket of tickets) {
        // チケットヘッダー行（クリックで編集）
        html += `<tr class="ticket-header" data-ticket-id="${ticket.ticketId}"><td class="row-header ticket-header clickable-ticket-cell">${escapeHtml(ticket.title)}</td>`;
        for (const day of displayDays) {
            const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const key = `${ticket.ticketId}_${dateStr}`;
            const data = actualDataCache[key];
            const display = formatCellDisplay(data?.progressRate, data?.hours);
            const cellDate = new Date(year, monthNum - 1, day);
            const cellDayOfWeek = cellDate.getDay();
            let cellClasses = 'actual-cell';
            if (cellDayOfWeek === 5) cellClasses += ' friday-border';
            if (isOutOfRange(cellDate, ticket)) cellClasses += ' out-of-range';
            html += `<td class="${cellClasses}" data-ticket-id="${ticket.ticketId}" data-date="${dateStr}">${display}</td>`;
        }
        html += '</tr>';

        // 子タスク行（入力可能 - 実績は子タスク単位で保存）
        const childTasks = ticket.childTasks || [];
        for (let childIndex = 0; childIndex < childTasks.length; childIndex++) {
            const child = childTasks[childIndex];
            html += `<tr class="child-task-row"><td class="row-header child-task-row">  ├ ${escapeHtml(child.text || child.name)}</td>`;
            for (const day of displayDays) {
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const key = `${ticket.ticketId}_${childIndex}_${dateStr}`;
                const data = actualDataCache[key];
                const display = formatCellDisplay(data?.progressRate, data?.hours);
                const cellDate = new Date(year, monthNum - 1, day);
                const cellDayOfWeek = cellDate.getDay();
                let cellClasses = 'actual-cell child-task-cell';
                if (cellDayOfWeek === 5) cellClasses += ' friday-border';
                if (isOutOfRange(cellDate, ticket)) cellClasses += ' out-of-range';
                html += `<td class="${cellClasses}" data-ticket-id="${ticket.ticketId}" data-child-index="${childIndex}" data-date="${dateStr}">${display}</td>`;
            }
            html += '</tr>';
        }
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    // ローディング非表示
    if (loadingEl) loadingEl.classList.add('hidden');

    // 実績セルのクリックイベント設定
    container.querySelectorAll('.actual-cell').forEach(cell => {
        cell.addEventListener('click', handleCellClick);
    });

    // チケットヘッダーのクリックで編集モーダルを開く
    container.querySelectorAll('.ticket-header[data-ticket-id] .clickable-ticket-cell').forEach(cell => {
        cell.addEventListener('click', (e) => {
            // 親trからticketIdを取得
            const row = cell.closest('.ticket-header');
            if (row) {
                const ticketId = row.dataset.ticketId;
                if (ticketId) {
                    e.stopPropagation();
                    openEditModal(ticketId);
                }
            }
        });
    });
}

async function fetchAllActualsForMonth(year, month, days, tickets) {
    actualDataCache = {};
    if (tickets.length === 0) return;

    // バッチAPIで一度に全実績を取得
    const ticketIds = tickets.map(t => t.ticketId);
    const params = new URLSearchParams();
    ticketIds.forEach(id => params.append('ticketIds', id));
    
    try {
        const allActuals = await api.get(`/api/tickets/actuals/batch?${params.toString()}`);
        if (Array.isArray(allActuals)) {
            allActuals.forEach(a => {
                const dateStr = a.date.split('T')[0]; // yyyy-MM-dd形式
                if (a.childTaskIndex !== null && a.childTaskIndex !== undefined) {
                    // 子タスクの実績
                    actualDataCache[`${a.ticketId}_${a.childTaskIndex}_${dateStr}`] = {
                        hours: a.hours,
                        progressRate: a.progressRate
                    };
                } else {
                    // 親チケットの実績
                    actualDataCache[`${a.ticketId}_${dateStr}`] = {
                        hours: a.hours,
                        progressRate: a.progressRate
                    };
                }
            });
        }
    } catch {
        // 実績なし
    }
}

// セルクリックハンドラ - 進捗率設定ポップアップを表示
function handleCellClick(e) {
    const cell = e.target;
    const ticketId = cell.dataset.ticketId;
    const date = cell.dataset.date;
    const childIndex = cell.dataset.childIndex !== undefined ? parseInt(cell.dataset.childIndex) : null;
    
    const key = childIndex !== null ? `${ticketId}_${childIndex}_${date}` : `${ticketId}_${date}`;
    const data = actualDataCache[key] || {};
    const currentProgress = data.progressRate ?? 0;
    const currentHours = data.hours ?? 0;

    showActualProgressPopup(cell, ticketId, date, childIndex, currentProgress, currentHours, async (progress, hours, deleted) => {
        // 保存後の処理 - キャッシュ更新と表示更新
        if (deleted) {
            // 削除された場合、キャッシュから削除
            delete actualDataCache[key];
            cell.textContent = '';
        } else {
            actualDataCache[key] = { hours, progressRate: progress };
            cell.textContent = formatCellDisplay(progress, hours);
        }
        
        // 子タスクの進捗保存後、親チケットの進捗セルも更新
        if (childIndex !== null) {
            updateParentProgressCell(ticketId, date);
        }
    });
}

// 子タスクの進捗平均に基づいて親チケットの進捗セルを更新
async function updateParentProgressCell(ticketId, date) {
    try {
        // サーバーから最新の実績を取得（そのチケットの全実績）
        const response = await fetch(`${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, {
            headers: { 'Authorization': `Bearer ${await getToken()}` }
        });
        if (!response.ok) return;
        
        const allActuals = await response.json();
        // その日付の親チケット実績を探す
        const parentActual = allActuals.find(a => a.date.startsWith(date) && a.childTaskIndex === null);
        if (parentActual && parentActual.progressRate !== null && parentActual.progressRate !== undefined) {
            const parentKey = `${ticketId}_${date}`;
            actualDataCache[parentKey] = {
                hours: parentActual.hours || 0,
                progressRate: parentActual.progressRate
            };
            // 親チケットのセルを更新
            const parentCell = document.querySelector(`td.actual-cell[data-ticket-id="${ticketId}"][data-date="${date}"]:not([data-child-index])`);
            if (parentCell) {
                parentCell.textContent = formatCellDisplay(parentActual.progressRate, parentActual.hours || 0);
            }
        }
    } catch (error) {
        console.error('[ActualTable] 親進捗セルの更新失敗:', error);
    }
}

// セル表示フォーマット "50% / 4h"
function formatCellDisplay(progressRate, hours) {
    const parts = [];
    if (progressRate !== null && progressRate !== undefined && progressRate > 0) {
        parts.push(`${progressRate}%`);
    }
    if (hours !== null && hours !== undefined && hours > 0) {
        parts.push(`${hours}h`);
    }
    return parts.join(' / ');
}

function getDayColor(dayOfWeek) {
    switch (dayOfWeek) {
        case 0: return '#dc2626'; // 日曜日
        case 6: return '#2563eb'; // 土曜日
        default: return 'inherit';
    }
}

/**
 * 日付オブジェクトをゼロパディングされた文字列に変換 (YYYY-MM-DD)
 */
function toDateString(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * セル日付がチケットの開始日・終了日範囲外かどうかをチェック
 * 日付のみ比較（時刻は無視）
 */
function isOutOfRange(cellDate, ticket) {
    if (ticket.startDate) {
        const start = new Date(ticket.startDate);
        if (toDateString(cellDate) < toDateString(start)) return true;
    }
    if (ticket.endDate) {
        const end = new Date(ticket.endDate);
        if (toDateString(cellDate) > toDateString(end)) return true;
    }
    return false;
}


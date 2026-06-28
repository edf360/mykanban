// 実績入力表モジュール

import { getAllTickets, getSettings } from './state.js';
import { api } from './api.js';
import { loadUserSettings, saveUserSettings } from './userSettings.js';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

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
    const settings = loadUserSettings();
    settings.actual = {
        visible: document.getElementById('actualModalOverlay')?.classList.contains('active') || false,
        assignee: assigneeSelect?.value || '',
        columns: Array.from(selectedColumns),
        month: monthInput?.value || ''
    };
    saveUserSettings(settings);
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

    // 営業日のみフィルタ
    const workDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthNum - 1, day);
        if (!isWeekendOrHoliday(date, holidaySet)) {
            workDays.push(day);
        }
    }

    // 表を生成
    let html = '<table class="actual-table"><thead><tr><th class="row-header">チケット / 日付</th>';

    // 日付ヘッダー（営業日のみ）
    for (const day of workDays) {
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
        // チケットヘッダー行
        html += `<tr class="ticket-header"><td class="row-header ticket-header">${escapeHtml(ticket.title)}</td>`;
        for (const day of workDays) {
            const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const key = `${ticket.ticketId}_${dateStr}`;
            const rawValue = actualDataCache[key];
            const value = (rawValue !== undefined && rawValue !== 0) ? rawValue : '';
            const cellDate = new Date(year, monthNum - 1, day);
            const cellDayOfWeek = cellDate.getDay();
            let cellClasses = 'editable-cell';
            if (cellDayOfWeek === 5) cellClasses += ' friday-border';
            html += `<td class="${cellClasses}" contenteditable="true" data-ticket-id="${ticket.ticketId}" data-date="${dateStr}">${value}</td>`;
        }
        html += '</tr>';

        // 子タスク行（入力可能 - 実績は子タスク単位で保存）
        const childTasks = ticket.childTasks || [];
        for (let childIndex = 0; childIndex < childTasks.length; childIndex++) {
            const child = childTasks[childIndex];
            html += `<tr class="child-task-row"><td class="row-header child-task-row">  ├ ${escapeHtml(child.text || child.name)}</td>`;
            for (const day of workDays) {
                const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const key = `${ticket.ticketId}_${childIndex}_${dateStr}`;
                const rawValue = actualDataCache[key];
                const value = (rawValue !== undefined && rawValue !== 0) ? rawValue : '';
                const cellDate = new Date(year, monthNum - 1, day);
                const cellDayOfWeek = cellDate.getDay();
                let cellClasses = 'editable-cell child-task-cell';
                if (cellDayOfWeek === 5) cellClasses += ' friday-border';
                html += `<td class="${cellClasses}" contenteditable="true" data-ticket-id="${ticket.ticketId}" data-child-index="${childIndex}" data-date="${dateStr}">${value}</td>`;
            }
            html += '</tr>';
        }
    }

    html += '</tbody></table>';
    container.innerHTML = html;

    // ローディング非表示
    if (loadingEl) loadingEl.classList.add('hidden');

    // contenteditable セルのイベント設定
    container.querySelectorAll('.editable-cell').forEach(cell => {
        // 元の値を保持（Escapeでキャンセル用）
        cell._originalValue = cell.textContent;

        // 入力イベント - 数値バリデーション
        cell.addEventListener('input', handleCellInput);

        // blurイベント - 保存
        cell.addEventListener('blur', handleCellBlur);

        // キーボードナビゲーション
        cell.addEventListener('keydown', handleCellKeydown);
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
                    actualDataCache[`${a.ticketId}_${a.childTaskIndex}_${dateStr}`] = a.hours;
                } else {
                    // 親チケットの実績
                    actualDataCache[`${a.ticketId}_${dateStr}`] = a.hours;
                }
            });
        }
    } catch {
        // 実績なし
    }
}

// contenteditable セルの入力バリデーション
function handleCellInput(e) {
    const cell = e.target;
    let text = cell.textContent;

    // 数値と小数点、ハイフンのみ許可
    text = text.replace(/[^0-9.\-]/g, '');
    
    // 小数点は1つのみ
    const parts = text.split('.');
    if (parts.length > 2) {
        text = parts[0] + '.' + parts.slice(1).join('');
    }

    // 変更があった場合は更新
    if (cell.textContent !== text) {
        // カーソル位置を保存
        const sel = window.getSelection();
        const cursorPos = sel.rangeCount > 0 ? sel.getRangeAt(0).startOffset : 0;
        cell.textContent = text;
        // カーソル位置を復元（可能な限り）
        if (sel.rangeCount > 0) {
            const newCursor = Math.min(cursorPos, text.length);
            const range = document.createRange();
            range.setStart(cell, newCursor);
            range.setEnd(cell, newCursor);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
}

// セルがフォーカスを失った時に保存
async function handleCellBlur(e) {
    const cell = e.target;
    const ticketId = cell.dataset.ticketId;
    const childIndex = cell.dataset.childIndex;
    const date = cell.dataset.date;
    const text = cell.textContent.trim();
    
    let hours = 0;
    if (text !== '') {
        hours = parseFloat(text);
        if (isNaN(hours)) {
            hours = 0;
        }
    }

    // 範囲チェック（0〜24）
    if (hours < 0) hours = 0;
    if (hours > 24) hours = 24;

    // 表示を整形
    cell.textContent = hours === 0 ? '' : hours;
    cell._originalValue = cell.textContent;

    try {
        const body = { date, hours };
        if (childIndex !== undefined && childIndex !== '') {
            body.childTaskIndex = parseInt(childIndex);
        }
        await api.post(`/api/tickets/${encodeURIComponent(ticketId)}/actuals`, body);
        if (childIndex !== undefined && childIndex !== '') {
            actualDataCache[`${ticketId}_${childIndex}_${date}`] = hours;
        } else {
            actualDataCache[`${ticketId}_${date}`] = hours;
        }
    } catch (err) {
        console.error('実績保存失敗:', err);
    }
}

// キーボードナビゲーション
function handleCellKeydown(e) {
    const cell = e.target;

    // Escape - 編集キャンセル
    if (e.key === 'Escape') {
        e.preventDefault();
        cell.textContent = cell._originalValue ?? '';
        cell.blur();
        return;
    }

    // Enter - 右隣のセルに移動
    if (e.key === 'Enter') {
        e.preventDefault();
        const nextCell = cell.parentElement?.nextElementSibling
            ? cell.parentElement.nextElementSibling.querySelector('.editable-cell')
            : null;
        if (nextCell) {
            nextCell.focus();
        }
        return;
    }

    // Tab はデフォルト動作で次のセルに移動（contenteditable間を移動）
}

function getDayColor(dayOfWeek) {
    switch (dayOfWeek) {
        case 0: return '#dc2626'; // 日曜日
        case 6: return '#2563eb'; // 土曜日
        default: return 'inherit';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

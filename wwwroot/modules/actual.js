/**
 * 実績登録モジュール
 * 日付ごとの作業時間を登録・参照・編集
 */

import { API_BASE, escapeHtml } from './state.js';
import { getToken } from './auth.js';

// ===== DOM要素キャッシュ =====
const el = {
    actualModal: null,
    actualTicketSelect: null,
    actualDateInput: null,
    actualHoursInput: null,
    actualSaveBtn: null,
    actualList: null,
};

let currentTicketId = null;
let actuals = [];

/**
 * DOM要素をキャッシュ
 */
function cacheElements() {
    el.actualModal = document.getElementById('actualModal');
    el.actualTicketSelect = document.getElementById('actualTicketSelect');
    el.actualDateInput = document.getElementById('actualDateInput');
    el.actualHoursInput = document.getElementById('actualHoursInput');
    el.actualSaveBtn = document.getElementById('actualSaveBtn');
    el.actualList = document.getElementById('actualList');
}

/**
 * 日付を yyyy-MM-dd 形式にフォーマット
 */
function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * 実績モーダルを開く
 */
export async function openActualModal(ticketId) {
    if (!el.actualModal) return;

    currentTicketId = ticketId;

    // チケット選択ドロップダウンを構築（doing/done の自分のチケット）
    populateTicketSelect(ticketId);

    // 実績一覧を取得
    await loadActualsForTicket(ticketId);

    // 入力フィールドを初期化（今日の日付を設定）
    if (el.actualDateInput) {
        el.actualDateInput.value = formatDate(new Date());
    }
    if (el.actualHoursInput) {
        el.actualHoursInput.value = '';
    }

    // モーダル表示
    el.actualModal.classList.add('active');
}

/**
 * チケット選択ドロップダウンに画面に表示されている doing/done のチケットを填充
 */
function populateTicketSelect(selectedId) {
    if (!el.actualTicketSelect) return;

    // DOMから現在表示されているチケットを取得
    const visibleTicketEls = document.querySelectorAll('.ticket-list .ticket:not([style*="display: none"])');
    const visibleIds = new Set();
    const ticketMap = new Map();

    visibleTicketEls.forEach(el => {
        const ticketId = el.dataset.id;
        if (ticketId) {
            visibleIds.add(ticketId);
            // data-column からカラム情報を取得
            const columnEl = el.closest('[data-column]');
            const column = columnEl ? columnEl.dataset.column : '';
            ticketMap.set(ticketId, { id: ticketId, title: el.querySelector('.ticket-content')?.textContent || '', column });
        }
    });

    // doing と done のチケットのみをフィルタ
    const filtered = [];
    for (const [id, ticket] of ticketMap) {
        if (ticket.column === 'doing' || ticket.column === 'done') {
            filtered.push(ticket);
        }
    }

    el.actualTicketSelect.innerHTML = '';

    for (const ticket of filtered) {
        const option = document.createElement('option');
        option.value = ticket.id;
        option.textContent = ticket.title;
        if (ticket.id === selectedId) {
            option.selected = true;
        }
        el.actualTicketSelect.appendChild(option);
    }
}

/**
 * 選択されたチケットの実績を読み込み・描画
 */
async function loadActualsForTicket(ticketId) {
    try {
        actuals = await fetchActuals(ticketId);
    } catch (error) {
        console.error('[Actual] Failed to fetch actuals:', error);
        actuals = [];
    }
    renderActualList();
}

/**
 * ドロップダウンでチケットを変更した時に呼び出し
 */
async function onTicketChanged(newTicketId) {
    currentTicketId = newTicketId;
    await loadActualsForTicket(newTicketId);
    if (el.actualHoursInput) {
        el.actualHoursInput.value = '';
    }
    if (el.actualDateInput) {
        el.actualDateInput.value = formatDate(new Date());
    }
}

/**
 * 実績モーダルを閉じる
 */
export function closeActualModal() {
    if (!el.actualModal) return;
    el.actualModal.classList.remove('active');
    currentTicketId = null;
    actuals = [];
}

/**
 * 実績一覧をDOMに描画
 */
function renderActualList() {
    if (!el.actualList) return;

    el.actualList.innerHTML = '';

    if (actuals.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'actual-empty';
        emptyDiv.textContent = '実績がありません';
        el.actualList.appendChild(emptyDiv);
        return;
    }

    // 日付降順でソート
    const sorted = [...actuals].sort((a, b) => new Date(b.date) - new Date(a.date));

    for (const actual of sorted) {
        const row = document.createElement('div');
        row.className = 'actual-row';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'actual-date';
        dateSpan.textContent = formatDate(new Date(actual.date));

        const hoursSpan = document.createElement('span');
        hoursSpan.className = 'actual-hours';
        hoursSpan.textContent = `${Math.round(actual.hours)}h`;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'actual-delete-btn';
        deleteBtn.textContent = '削除';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteActual(actual.date);
        });

        // 行クリックで編集モードに
        row.addEventListener('click', () => {
            loadActualForEdit(actual);
        });
        row.style.cursor = 'pointer';

        row.appendChild(dateSpan);
        row.appendChild(hoursSpan);
        row.appendChild(deleteBtn);
        el.actualList.appendChild(row);
    }
}

/**
 * 過去の実績を編集用に読み込み
 */
function loadActualForEdit(actual) {
    const dateStr = actual.date.split('T')[0];
    if (el.actualDateInput) {
        el.actualDateInput.value = dateStr;
    }
    if (el.actualHoursInput) {
        el.actualHoursInput.value = Math.round(actual.hours);
    }
}

/**
 * 実績を保存（登録または更新）
 */
async function saveActual() {
    if (!currentTicketId || !el.actualDateInput || !el.actualHoursInput) return;

    const date = el.actualDateInput.value;
    const hoursValue = el.actualHoursInput.value.trim();

    if (!date) {
        alert('日付を選択してください');
        return;
    }
    if (hoursValue === '') {
        alert('作業時間を入力してください');
        return;
    }
    const hours = parseFloat(hoursValue);
    if (isNaN(hours) || hours < 0) {
        alert('有効な時間を入力してください');
        return;
    }

    try {
        const payload = { date, hours };
        console.log('[Actual] Saving:', payload);
        
        const response = await fetch(`${API_BASE}/${encodeURIComponent(currentTicketId)}/actuals`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify(payload)
        });

        console.log('[Actual] Response status:', response.status);

        // HTMLが返ってきた場合は早期にエラー処理
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('text/html')) {
            const text = await response.text();
            console.error('[Actual] Received HTML instead of JSON:', text.substring(0, 200));
            throw new Error('サーバーエラーが発生しました (APIレスポンスがHTML)。サーバーを再起動してください。');
        }

        if (!response.ok) {
            let errorMessage = '保存に失敗しました';
            if (contentType.includes('application/json')) {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } else {
                errorMessage = `サーバーエラー (HTTP ${response.status})`;
            }
            throw new Error(errorMessage);
        }

        const result = await response.json();

        // 一覧を更新
        const index = actuals.findIndex(a => a.date.split('T')[0] === date);
        if (index >= 0) {
            actuals[index] = result;
        } else {
            actuals.push(result);
        }

        // UIを更新
        renderActualList();

        // 入力フィールドをクリア
        el.actualHoursInput.value = '';
        el.actualDateInput.value = formatDate(new Date());

    } catch (error) {
        console.error('[Actual] Failed to save:', error);
        alert('保存に失敗しました: ' + error.message);
    }
}

/**
 * 実績を削除
 */
async function deleteActual(date) {
    if (!currentTicketId) return;

    const dateStr = date.split('T')[0];

    try {
        const response = await fetch(`${API_BASE}/${currentTicketId}/actuals/${dateStr}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });

        if (!response.ok) {
            const contentType = response.headers.get('content-type');
            let errorMessage = '削除に失敗しました';
            if (contentType && contentType.includes('application/json')) {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            }
            throw new Error(errorMessage);
        }

        // 一覧を更新
        actuals = actuals.filter(a => a.date.split('T')[0] !== dateStr);

        // UIを更新
        renderActualList();

    } catch (error) {
        console.error('[Actual] Failed to delete:', error);
        alert('削除に失敗しました: ' + error.message);
    }
}

/**
 * 実績一覧をAPIから取得
 */
async function fetchActuals(ticketId) {
    const response = await fetch(`${API_BASE}/${ticketId}/actuals`, {
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
}

/**
 * 実績モジュールを初期化
 */
export function initActual() {
    cacheElements();

    if (!el.actualModal) return;

    // 保存ボタン
    if (el.actualSaveBtn) {
        el.actualSaveBtn.addEventListener('click', saveActual);
    }

    // チケット選択ドロップダウン
    if (el.actualTicketSelect) {
        el.actualTicketSelect.addEventListener('change', (e) => {
            onTicketChanged(e.target.value);
        });
    }

    // モーダル外クリックで閉じる
    el.actualModal.addEventListener('click', (e) => {
        if (e.target === el.actualModal) {
            closeActualModal();
        }
    });

    // Enterキーで保存
    if (el.actualHoursInput) {
        el.actualHoursInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveActual();
            }
        });
    }
}

/**
 * 履歴表示モジュール
 */

import { API_BASE, escapeHtml, state, getEditingTicketId, on } from './state.js';
import { apiRequest } from './api.js';

/**
 * CSSクラス名として安全な文字列にサニタイズ
 */
function sanitizeClassName(str) {
    return String(str).replace(/[^a-zA-Z0-9_-]/g, '');
}

/**
 * ISO文字列から日本時間(HH:mm)を抽出
 */
function extractTimeJST(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * 履歴を日本日日付でグループ化（降順ソート済みMapを返す）
 */
function groupByDate(histories) {
    const grouped = new Map();
    for (const h of histories) {
        if (!h.date) continue;
        const date = new Date(h.date);
        if (isNaN(date.getTime())) continue;
        // 日本時間の日付キーを取得
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        if (!grouped.has(dateKey)) grouped.set(dateKey, []);
        grouped.get(dateKey).push(h);
    }
    // 日付降順でソート
    const sortedDates = [...grouped.keys()].sort((a, b) => b.localeCompare(a));
    const sorted = new Map();
    for (const date of sortedDates) {
        sorted.set(date, grouped.get(date));
    }
    return sorted;
}

/**
 * 履歴タイプごとの表示ラベル
 */
const typeLabels = {
    created: '作成',
    progress: '進捗',
    column: '移動',
    assignee: '担当者',
    title: 'タイトル',
    label: 'ラベル',
    childtask: '子タスク',
    'childtask-progress': '子タスク進捗',
    memo: 'メモ',
    'date-start': '開始日',
    'date-end': '終了日',
    effort: '工数'
};

/**
 * 履歴タイプごとの詳細テキスト生成（ディスパッチテーブル）
 */
const historyDetailRenderers = {
    created: () => 'チケットが作成されました',

    progress: (item) => {
        const prev = item.previousValue != null ? item.previousValue : '-';
        const next = item.value != null ? item.value : '-';
        const childProgress = item.childTaskProgress != null ? ` (子タスク: ${item.childTaskProgress}%)` : '';
        return `進捗を ${prev}% → ${next}% に変更${childProgress}`;
    },

    'childtask-progress': (item) => {
        try {
            const data = JSON.parse(item.value || '{}');
            const prev = data.oldProgress != null ? data.oldProgress : '-';
            const next = data.newProgress != null ? data.newProgress : '-';
            const ticketOld = data.ticketOldProgress != null ? data.ticketOldProgress : '-';
            const ticketNew = data.ticketNewProgress != null ? data.ticketNewProgress : '-';
            return `子タスク進捗 ${prev}% → ${next}% (チケット: ${ticketOld}% → ${ticketNew}%)`;
        } catch (e) {
            return `子タスク進捗が変更されました`;
        }
    },

    column: (item) => {
        const names = { todo: 'To Do', doing: 'Doing', done: 'Done', archive: 'Archive' };
        const from = item.previousValue ? (names[item.previousValue] || escapeHtml(String(item.previousValue))) : '-';
        const to = item.value ? (names[item.value] || escapeHtml(String(item.value))) : '-';
        return `${from} → ${to} に移動`;
    },

    assignee: (item) => {
        try {
            const oldVal = item.previousValue || '';
            const newVal = item.value || '';
            if (oldVal.startsWith('main:') && newVal.startsWith('main:')) {
                const oldMain = oldVal.substring(5) || '-';
                const newMain = newVal.substring(5) || '-';
                return `メイン担当者: ${escapeHtml(oldMain)} → ${escapeHtml(newMain)}`;
            } else {
                const oldList = JSON.parse(oldVal || '[]');
                const newList = JSON.parse(newVal || '[]');
                return `担当者: [${oldList.join(', ')}] → [${newList.join(', ')}]`;
            }
        } catch (e) {
            console.warn('[historyDetail] Failed to parse assignee:', e);
            return `担当者が変更されました`;
        }
    },

    title: (item) => {
        const oldTitle = item.previousValue ? escapeHtml(item.previousValue) : '-';
        const newTitle = item.value ? escapeHtml(item.value) : '-';
        return `${oldTitle} → ${newTitle}`;
    },

    label: (item) => {
        try {
            const oldList = JSON.parse(item.previousValue || '[]');
            const newList = JSON.parse(item.value || '[]');
            return `ラベル: [${oldList.join(', ')}] → [${newList.join(', ')}]`;
        } catch (e) {
            console.warn('[historyDetail] Failed to parse label:', e);
            return `ラベルが変更されました`;
        }
    },

    childtask: () => '子タスクが変更されました',

    memo: () => 'メモが変更されました',

    'date-start': (item) => {
        const oldDate = item.previousValue || '-';
        const newDate = item.value || '-';
        return `開始日: ${oldDate} → ${newDate}`;
    },

    'date-end': (item) => {
        const oldDate = item.previousValue || '-';
        const newDate = item.value || '-';
        return `終了日: ${oldDate} → ${newDate}`;
    },

    effort: (item) => {
        const oldEffort = item.previousValue || '-';
        const newEffort = item.value || '-';
        return `工数: ${oldEffort}h → ${newEffort}h`;
    },
};

/**
 * グループ化された履歴をDOMに描画
 */
function renderHistoryList(historyListEl, grouped) {
    for (const [date, items] of grouped) {
        // 日付ヘッダー
        const dateDiv = document.createElement('div');
        dateDiv.className = 'history-date';
        dateDiv.style.marginBottom = '4px';
        dateDiv.style.marginTop = '8px';
        dateDiv.style.fontWeight = '600';
        dateDiv.textContent = date;
        historyListEl.appendChild(dateDiv);

        for (const item of items) {
            const div = document.createElement('div');
            div.className = 'history-item';

            // タイプラベル
            const typeLabel = typeLabels[item.type] || escapeHtml(String(item.type));
            const typeSpan = document.createElement('span');
            typeSpan.className = `history-type ${sanitizeClassName(item.type)}`;
            typeSpan.textContent = typeLabel;

            // 詳細テキスト（ディスパッチテーブル使用）
            const renderer = historyDetailRenderers[item.type];
            const detail = renderer ? renderer(item) : '変更がありました';
            const detailSpan = document.createElement('span');
            detailSpan.className = 'history-detail';
            detailSpan.textContent = detail;

            // 時刻表示
            const timeSpan = document.createElement('span');
            timeSpan.className = 'history-time';
            const timeStr = extractTimeJST(item.date);
            if (timeStr) {
                timeSpan.textContent = timeStr;
            }

            div.appendChild(typeSpan);
            div.appendChild(detailSpan);
            div.appendChild(timeSpan);
            historyListEl.appendChild(div);
        }
    }
}

/**
 * 履歴を取得して表示
 */
export async function showHistory(ticketId) {
    // DOM要素を冒頭で取得
    const historyListEl = document.getElementById('historyList');
    const historyModal = document.getElementById('historyModal');

    if (!historyListEl || !historyModal) {
        console.error('[showHistory] Required DOM elements not found');
        return;
    }

    // DOMを完全リセット
    historyListEl.replaceChildren();

    try {
        const histories = await apiRequest('GET', `${API_BASE}/${ticketId}/history`, null);

        if (!histories || histories.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'history-empty';
            emptyDiv.textContent = '履歴はありません';
            historyListEl.appendChild(emptyDiv);
        } else {
            // データ変換 → UI描画 の分離
            const grouped = groupByDate(histories);
            renderHistoryList(historyListEl, grouped);
        }

        historyModal.classList.add('active');
    } catch (error) {
        console.error('[showHistory] Failed to load history:', error);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'history-empty';
        errorDiv.textContent = '履歴の読み込みに失敗しました';
        historyListEl.appendChild(errorDiv);
        historyModal.classList.add('active');
    }
}

/**
 * 履歴ダイアログを初期化（イベントリスナー設定）
 */
/**
 * 履歴確認ボタンの有効/無効を更新
 * 新規チケット時は無効、既存チケット編集時は有効
 */
function updateHistoryButton() {
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    if (!viewHistoryBtn) return;
    const isEdit = !!getEditingTicketId();
    viewHistoryBtn.disabled = !isEdit;
}

export function initHistory() {
    const historyModal = document.getElementById('historyModal');
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    const closeHistoryBtn = document.getElementById('closeHistoryBtn');

    // 初期状態でボタンの有効/無効を設定
    updateHistoryButton();

    viewHistoryBtn.addEventListener('click', () => {
        const editingId = getEditingTicketId();
        if (editingId) {
            showHistory(editingId);
        }
    });

    closeHistoryBtn.addEventListener('click', () => {
        historyModal.classList.remove('active');
    });

    historyModal.addEventListener('click', (e) => {
        if (e.target.id === 'historyModal') {
            historyModal.classList.remove('active');
        }
    });

    // モーダル状態変更時にボタンの有効/無効を更新
    on('modal-changed', () => {
        updateHistoryButton();
    });
}

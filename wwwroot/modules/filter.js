/**
 * フィルター機能モジュール
 * DOM取得・state更新・render呼び出しを一元管理
 */

import { setFilter, getFilterAssignee, getAssigneeSuggestions, getLabelSuggestions } from './state.js';
import { renderAllTickets } from './renderer.js';
import { updateMemoColumn } from './memo.js';

// ===== DOM要素を一元化 =====
const elements = {
    assigneeSelect: null,
    mainAssigneeCheckbox: null,
    searchInput: null,
    labelSelect: null,
    filterToggleBtn: null,
    filterArea: null,
    filterCloseBtn: null,
};

/**
 * DOM要素をまとめて取得・キャッシュ
 */
function cacheElements() {
    elements.assigneeSelect = document.getElementById('assigneeFilterSelect');
    elements.mainAssigneeCheckbox = document.getElementById('mainAssigneeOnlyCheckbox');
    elements.searchInput = document.getElementById('titleSearchInput');
    elements.labelSelect = document.getElementById('labelFilterSelect');
    elements.filterToggleBtn = document.getElementById('filterToggleBtn');
    elements.filterArea = document.getElementById('filterArea');
    elements.filterCloseBtn = document.getElementById('filterCloseBtn');
}

// ===== debounceユーティリティ =====
function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * 再描画をまとめた集約関数
 */
function triggerRender() {
    renderAllTickets();
    updateMemoColumn();
}

const debouncedRender = debounce(triggerRender, 200);

// ===== メイン担当チェックボックスのdisabled状態を同期 =====
function syncMainAssigneeCheckbox() {
    if (!elements.mainAssigneeCheckbox) return;
    const hasAssignee = !!getFilterAssignee();
    elements.mainAssigneeCheckbox.disabled = !hasAssignee;
    if (!hasAssignee) {
        elements.mainAssigneeCheckbox.checked = false;
        setFilter({ mainOnly: false });
    }
}

// ===== 担当者フィルター変更ハンドラー =====
function onAssigneeChange() {
    setFilter({ assignee: elements.assigneeSelect?.value || '' });
    syncMainAssigneeCheckbox();
    triggerRender();
}

// ===== 検索入力ハンドラー（debounce適用） =====
function onSearchInput() {
    setFilter({ keyword: elements.searchInput?.value || '' });
    debouncedRender();
}

// ===== メイン担当チェックボックス変更ハンドラー =====
function onMainAssigneeChange() {
    setFilter({ mainOnly: elements.mainAssigneeCheckbox?.checked || false });
    triggerRender();
}

// ===== ラベルフィルター変更ハンドラー =====
function onLabelChange() {
    setFilter({ label: elements.labelSelect?.value || '' });
    triggerRender();
}

// ===== フィルター表示トグルハンドラー =====
function onFilterToggle() {
    if (!elements.filterArea || !elements.filterToggleBtn) return;
    elements.filterArea.classList.toggle('hidden');
    elements.filterToggleBtn.classList.toggle('active');
}

// ===== フィルター閉じるハンドラー =====
function onFilterClose() {
    if (!elements.filterArea || !elements.filterToggleBtn) return;
    elements.filterArea.classList.add('hidden');
    elements.filterToggleBtn.classList.remove('active');
}

/**
 * ラベルフィルターをpopulate
 */
export function populateLabelFilter() {
    const selectEl = document.getElementById('labelFilterSelect');
    if (!selectEl) {
        console.warn('[populateLabelFilter] labelFilterSelect element not found');
        return;
    }
    const suggestions = getLabelSuggestions();
    selectEl.innerHTML = '<option value="">すべて</option>';
    suggestions.forEach(label => {
        const option = document.createElement('option');
        option.value = label;
        option.textContent = label;
        selectEl.appendChild(option);
    });
}

/**
 * 担当者フィルターをpopulate
 */
export function populateAssigneeFilter() {
    const selectEl = document.getElementById('assigneeFilterSelect');
    if (!selectEl) {
        console.warn('[populateAssigneeFilter] assigneeFilterSelect element not found');
        return;
    }
    const suggestions = getAssigneeSuggestions();
    selectEl.innerHTML = '<option value="">すべて</option>';
    suggestions.forEach(assignee => {
        const option = document.createElement('option');
        option.value = assignee;
        option.textContent = assignee;
        selectEl.appendChild(option);
    });
}

/**
 * フィルター機能をすべて初期化（一元化）
 */
export function initFilter() {
    cacheElements();

    // 担当者フィルター
    if (elements.assigneeSelect) {
        elements.assigneeSelect.addEventListener('change', onAssigneeChange);
        // 初期状態：担当者が選択されていないので無効化
        syncMainAssigneeCheckbox();
    }

    // 検索入力
    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', onSearchInput);
    }

    // メイン担当限定フィルター
    if (elements.mainAssigneeCheckbox) {
        elements.mainAssigneeCheckbox.addEventListener('change', onMainAssigneeChange);
    }

    // フィルター表示トグル
    if (elements.filterToggleBtn && elements.filterArea) {
        elements.filterToggleBtn.classList.add('active');
        elements.filterToggleBtn.addEventListener('click', onFilterToggle);
    }

    // ラベルフィルター
    if (elements.labelSelect) {
        elements.labelSelect.addEventListener('change', onLabelChange);
    }

    // フィルター閉じるボタン
    if (elements.filterCloseBtn) {
        elements.filterCloseBtn.addEventListener('click', onFilterClose);
    }
}

/**
 * 後方互換用（個別初期化関数はdeprecated、initFilterのみを使用）
 */
export const initTicketSearch = deprecated('initTicketSearch', 'initFilter');
export const initMainAssigneeFilter = deprecated('initMainAssigneeFilter', 'initFilter');
export const initFilterToggle = deprecated('initFilterToggle', 'initFilter');

function deprecated(name, replacement) {
    return function () {
        console.warn(`[filter] ${name} is deprecated. Use ${replacement} instead.`);
    };
}

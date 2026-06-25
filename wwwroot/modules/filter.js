/**
 * フィルター機能モジュール
 * DOM取得・state更新・render呼び出しを一元管理
 */

import { setFilter, getFilterAssignee, getAssigneeSuggestions, getLabelSuggestions } from './state.js';
import { renderAllTickets } from './renderer.js';
import { updateMemoColumn } from './memo.js';
import { loadUserSettings, saveUserSettings } from './userSettings.js';

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
        // fn に引数のみ渡し、this 束縛は行わない（イベントハンドラ外で使用する想定）
        timer = setTimeout(() => fn(...args), delay);
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
    const selectedAssignee = elements.assigneeSelect?.value || '';
    setFilter({ assignee: selectedAssignee });
    syncMainAssigneeCheckbox();
    // 担当者が選択されている場合、memoカラムを表示
    if (selectedAssignee) {
        const memoColumn = document.getElementById('memoColumn');
        if (memoColumn) {
            memoColumn.classList.remove('hidden');
        }
        updateMemoColumn();
    }
    // 担当者「すべて」を選択した場合はメモ列を閉じる
    if (!selectedAssignee) {
        hideMemoColumn();
    }
    triggerRender();
    saveFilterState();
}

// ===== メモ列を非表示にする =====
function hideMemoColumn() {
    const memoColumn = document.getElementById('memoColumn');
    const memoToggleBtn = document.getElementById('memoToggleBtn');
    if (memoColumn) {
        memoColumn.classList.add('hidden');
    }
    if (memoToggleBtn) {
        memoToggleBtn.classList.remove('active');
    }
    // 保存された設定も更新
    const settings = loadUserSettings();
    if (settings.memo) {
        settings.memo.visible = false;
        saveUserSettings(settings);
    }
}

// ===== 検索入力ハンドラー（debounce適用） =====
function onSearchInput() {
    setFilter({ keyword: elements.searchInput?.value || '' });
    debouncedRender();
    saveFilterState();
}

// ===== メイン担当チェックボックス変更ハンドラー =====
function onMainAssigneeChange() {
    setFilter({ mainOnly: elements.mainAssigneeCheckbox?.checked || false });
    triggerRender();
    saveFilterState();
}

// ===== ラベルフィルター変更ハンドラー =====
function onLabelChange() {
    setFilter({ label: elements.labelSelect?.value || '' });
    triggerRender();
    saveFilterState();
}

// ===== フィルター表示トグルハンドラー =====
function onFilterToggle() {
    if (!elements.filterArea || !elements.filterToggleBtn) return;
    const isHidden = elements.filterArea.classList.contains('hidden');
    elements.filterArea.classList.toggle('hidden');
    if (isHidden) {
        elements.filterToggleBtn.classList.add('active');
    } else {
        elements.filterToggleBtn.classList.remove('active');
    }
    adjustBoardForFilter();
    saveFilterState();
}

// ===== フィルター閉じるハンドラー =====
function onFilterClose() {
    if (!elements.filterArea || !elements.filterToggleBtn) return;
    elements.filterArea.classList.add('hidden');
    elements.filterToggleBtn.classList.remove('active');
    adjustBoardForFilter();
    saveFilterState();
}

// ===== カンバンボードのフィルター調整 =====
function adjustBoardForFilter() {
    const filterArea = document.getElementById('filterArea');
    const kanbanBoard = document.querySelector('.kanban-board');
    if (!filterArea || !kanbanBoard) return;
    
    const isFilterVisible = !filterArea.classList.contains('hidden');
    const filterHeight = filterArea.offsetHeight;
    const filterTop = 20; // CSSのtop値
    const topOffset = filterTop + filterHeight + 10; // 10pxの余白
    
    if (isFilterVisible) {
        kanbanBoard.style.paddingTop = `${topOffset}px`;
    } else {
        kanbanBoard.style.paddingTop = '';
    }
}

// ===== 初期調整（ページ読み込み時） =====
export function adjustBoardForFilterOnInit() {
    adjustBoardForFilter();
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
 * フィルター状態を保存
 */
function saveFilterState() {
    const settings = loadUserSettings();
    settings.filter = {
        visible: !elements.filterArea?.classList.contains('hidden'),
        assignee: elements.assigneeSelect?.value || '',
        keyword: elements.searchInput?.value || '',
        label: elements.labelSelect?.value || '',
        mainOnly: elements.mainAssigneeCheckbox?.checked || false
    };
    saveUserSettings(settings);
}

/**
 * フィルター機能をすべて初期化（一元化）
 */
export function initFilter() {
    cacheElements();

    // 保存された設定を復元
    const settings = loadUserSettings();
    const f = settings.filter;

    // フィルター表示/非表示を復元（デフォルトは表示）
    if (elements.filterArea) {
        // visible が明示的に false の場合のみ非表示（デフォルトは表示）
        if (f.visible === false) {
            elements.filterArea.classList.add('hidden');
            if (elements.filterToggleBtn) elements.filterToggleBtn.classList.remove('active');
        } else {
            elements.filterArea.classList.remove('hidden');
            if (elements.filterToggleBtn) elements.filterToggleBtn.classList.add('active');
        }
    }

    // フィルター値を復元
    if (elements.assigneeSelect) elements.assigneeSelect.value = f.assignee || '';
    if (elements.searchInput) elements.searchInput.value = f.keyword || '';
    if (elements.labelSelect) elements.labelSelect.value = f.label || '';
    if (elements.mainAssigneeCheckbox) elements.mainAssigneeCheckbox.checked = f.mainOnly || false;

    // stateに反映
    setFilter({ assignee: f.assignee || '', keyword: f.keyword || '', label: f.label || '', mainOnly: f.mainOnly || false });

    // 担当者が選択されている場合、memoカラムを表示
    if (f.assignee) {
        const memoColumn = document.getElementById('memoColumn');
        if (memoColumn) {
            memoColumn.classList.remove('hidden');
        }
    }

    // 復元したフィルター値を初回描画時にも反映
    triggerRender();

    // 初期調整（ページ読み込み時にフィルターが表示されている場合の対応）
    adjustBoardForFilter();

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

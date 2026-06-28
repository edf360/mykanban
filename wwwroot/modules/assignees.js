/**
 * 担当者管理モジュール
 */

import { getCurrentAssignees, getMainAssignee, setMainAssignee, getAssigneeSuggestions,
         addAssigneeToState, removeAssigneeFromState, escapeHtml, setModalState, state } from './state.js';

/**
 * 担当者を追加
 */
export function addAssignee(text) {
    addAssigneeToState(text);
    renderAssigneeTags();
}

/**
 * 担当者を削除
 */
export function removeAssignee(index) {
    removeAssigneeFromState(index);
    renderAssigneeTags();
}

/**
 * 担当者タグのイベントハンドラ（イベント委譲用）
 */
function handleAssigneeTagClick(e) {
    const removeBtn = e.target.closest('.remove-assignee');
    if (removeBtn) {
        e.stopPropagation();
        const index = Number(removeBtn.dataset.index);
        if (Number.isNaN(index)) {
            return;
        }
        removeAssignee(index);
        renderAssigneeSelect();
        return;
    }
    const tag = e.target.closest('.assignee-tag');
    if (tag) {
        const clickedAssignee = tag.dataset.assignee;
        setMainAssignee(clickedAssignee);
        renderAssigneeTags();
    }
}

/**
 * 担当者タグを再描画（メイン担当者に冠アイコン）
 * タグクリックでメイン担当者を切り替え
 */
export function renderAssigneeTags() {
    const assigneeTagsEl = document.getElementById('assigneeTags');
    if (!assigneeTagsEl) return;

    assigneeTagsEl.innerHTML = '';

    const currentAssignees = getCurrentAssignees();
    const mainAssignee = getMainAssignee();

    currentAssignees.forEach((assignee, i) => {
        const isMain = assignee === mainAssignee;
        const tag = document.createElement('span');
        tag.className = `assignee-tag${isMain ? ' main' : ''}`;
        tag.dataset.assignee = assignee;
        tag.title = 'クリックでメイン担当者に設定';

        tag.innerHTML = `${escapeHtml(assignee)} <span class="remove-assignee" data-index="${i}">&times;</span>`;

        assigneeTagsEl.appendChild(tag);
    });

    // イベント委譲（1回だけ設定）
    assigneeTagsEl.onclick = handleAssigneeTagClick;
}

/**
 * 担当者選択ドロップダウンを描画（担当者トグルとメインチェック付き）
 */
export function renderAssigneeSelect() {
    const listEl = document.getElementById('assigneeList');
    const toggleBtn = document.getElementById('assigneeToggleBtn');
    if (!listEl || !toggleBtn) return;

    listEl.innerHTML = '';

    const allAssignees = getAssigneeSuggestions();
    const currentAssignees = getCurrentAssignees();
    const mainAssignee = getMainAssignee();

    // ドロップダウンボタンのテキストを更新
    if (currentAssignees.length > 0) {
        toggleBtn.textContent = currentAssignees.join(', ') + ' ▼';
    } else {
        toggleBtn.textContent = '担当者を選択 ▼';
    }

    allAssignees.forEach(assignee => {
        const isEnabled = currentAssignees.includes(assignee);
        const isMain = assignee === mainAssignee;

        const item = document.createElement('div');
        item.className = 'assignee-list-item';

        item.innerHTML = `
            <span class="assignee-item-name">${escapeHtml(assignee)}</span>
            <div class="assignee-controls">
                <label class="assignee-switch" title="担当者">
                    <input type="checkbox"
                           class="assignee-enabled-toggle"
                           data-assignee="${escapeHtml(assignee)}"
                           ${isEnabled ? 'checked' : ''}>
                    <span class="assignee-slider"></span>
                </label>
                <label class="assignee-main-check-label" title="メイン担当者">
                    <input type="checkbox"
                           class="assignee-main-check"
                           data-assignee="${escapeHtml(assignee)}"
                           ${isMain ? 'checked' : ''}
                           ${!isEnabled ? 'disabled' : ''}>
                </label>
            </div>
        `;

        listEl.appendChild(item);
    });

    // トグルスイッチとメインチェックのイベント（イベント委譲）
    // 注意: innerHTMLクリアで古いリスナーは破棄されるので毎回新規追加OK
    listEl.addEventListener('change', (e) => {
        // 担当者トグル
        if (e.target.classList.contains('assignee-enabled-toggle')) {
            const assignee = e.target.dataset.assignee;
            const isEnabled = e.target.checked;
            handleAssigneeToggle(assignee, isEnabled);
            return;
        }

        // メインチェック（有効になっている担当者のみ）
        if (e.target.classList.contains('assignee-main-check') && !e.target.disabled) {
            const assignee = e.target.dataset.assignee;
            handleMainCheck(assignee, e.target.checked);
        }
    });

    // ボタンクリックでドロップダウン表示/非表示
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        listEl.classList.toggle('active');
    };

    // ドロップダウン外クリックで閉じる（1回だけ設定）
    if (!toggleBtn.dataset.listenerAttached) {
        toggleBtn.dataset.listenerAttached = 'true';
        document.addEventListener('click', (event) => {
            const dropdown = document.getElementById('assigneeDropdown');
            if (dropdown && !dropdown.contains(event.target)) {
                listEl.classList.remove('active');
            }
        });
    }
}

/**
 * 担当者トグルの処理
 * 再描画するとイベントリスナーが重複するため、チェックボックス状態のみを更新する
 */
function handleAssigneeToggle(assignee, isEnabled) {
    if (isEnabled) {
        // 追加
        addAssigneeToState(assignee);
    } else {
        // 削除
        setModalState({ currentAssignees: getCurrentAssignees().filter(a => a !== assignee) });
        // 削除された担当者がメインだった場合はメインをリセット
        if (getMainAssignee() === assignee) {
            const remaining = getCurrentAssignees();
            setMainAssignee(remaining.length > 0 ? remaining[0] : null);
        }
    }
    renderAssigneeTags();
    // 担当者トグルのチェックボックス状態を更新（再描画なしで無限ループ防止）
    updateAssigneeToggleStates();
    // メインチェックの状態を更新（再描画なしで無限ループ防止）
    updateMainCheckStates();
}

/**
 * 担当者トグルのチェックボックス状態を更新（再描画なし）
 */
function updateAssigneeToggleStates() {
    const currentAssignees = getCurrentAssignees();
    document.querySelectorAll('.assignee-enabled-toggle').forEach(toggle => {
        toggle.checked = currentAssignees.includes(toggle.dataset.assignee);
    });
}

/**
 * メインチェックの状態を更新（再描画なし）
 * 有効になっていない担当者のメインチェックをdisabledに
 */
function updateMainCheckStates() {
    const currentAssignees = getCurrentAssignees();
    const mainAssignee = getMainAssignee();
    document.querySelectorAll('.assignee-main-check').forEach(check => {
        const assignee = check.dataset.assignee;
        check.disabled = !currentAssignees.includes(assignee);
        check.checked = assignee === mainAssignee;
    });
}

/**
 * メインチェックの処理（単一選択）
 * 再描画しないことで無限ループを防ぐ
 * checked: true  → この担当者をメインに設定
 * checked: false → 他の有効担当者に切り替え
 */
function handleMainCheck(assignee, checked) {
    if (checked) {
        // この担当者をメインに設定
        setMainAssignee(assignee);
    } else {
        // 他の有効担当者に切り替え（最初に選択された有効担当者）
        const remaining = getCurrentAssignees().filter(a => a !== assignee);
        setMainAssignee(remaining.length > 0 ? remaining[0] : assignee);
    }
    renderAssigneeTags();
    // チェックボックスの状態を更新（再描画なし）
    updateMainCheckStates();
}

/**
 * ドロップダウンの変更から担当者配列を更新（後方互換用）
 */
export function syncAssigneesFromSelect() {
    // カスタムドロップダウンでは直接使用しないが、後方互換のため残す
}

/**
 * グラフパネル用担当者ドロップダウンを描画（トグルスイッチ付き、メインチェックなし）
 */
export function renderGraphAssigneeSelect() {
    const listEl = document.getElementById('graphAssigneeList');
    const toggleBtn = document.getElementById('graphAssigneeToggleBtn');
    console.log('[DEBUG] renderGraphAssigneeSelect: listEl=', !!listEl, 'toggleBtn=', !!toggleBtn);
    if (!listEl || !toggleBtn) {
        console.warn('[DEBUG] renderGraphAssigneeSelect: 要素が見つかりません');
        return;
    }

    listEl.innerHTML = '';

    const allAssignees = getAssigneeSuggestions();
    const selectedAssignees = state?.graphAssignees || [];

    // ボタンのテキストを更新
    if (selectedAssignees.length === 0) {
        toggleBtn.textContent = '全担当者';
    } else if (selectedAssignees.length === 1) {
        toggleBtn.textContent = selectedAssignees[0] + ' ▼';
    } else {
        toggleBtn.textContent = `${selectedAssignees.length}人選択 ▼`;
    }

    allAssignees.forEach(assignee => {
        const isEnabled = selectedAssignees.includes(assignee);

        const item = document.createElement('div');
        item.className = 'assignee-list-item';

        item.innerHTML = `
            <span class="assignee-item-name">${escapeHtml(assignee)}</span>
            <div class="assignee-controls">
                <label class="assignee-switch" title="表示/非表示">
                    <input type="checkbox"
                           class="graph-assignee-toggle"
                           data-assignee="${escapeHtml(assignee)}"
                           ${isEnabled ? 'checked' : ''}>
                    <span class="assignee-slider"></span>
                </label>
            </div>
        `;

        listEl.appendChild(item);
    });

    // トグルスイッチのイベント（イベント委譲）
    listEl.addEventListener('change', (e) => {
        if (e.target.classList.contains('graph-assignee-toggle')) {
            const assignee = e.target.dataset.assignee;
            const isEnabled = e.target.checked;
            handleGraphAssigneeToggle(assignee, isEnabled);
        }
    });

    // ボタンクリックでドロップダウン表示/非表示
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        listEl.classList.toggle('active');
    };

    // ドロップダウン外クリックで閉じる（1回だけ設定）
    if (!toggleBtn.dataset.graphListenerAttached) {
        toggleBtn.dataset.graphListenerAttached = 'true';
        document.addEventListener('click', (event) => {
            const dropdown = document.getElementById('graphAssigneeDropdown');
            if (dropdown && !dropdown.contains(event.target)) {
                listEl.classList.remove('active');
            }
        });
    }
}

/**
 * グラフ用担当者トグルの処理
 */
function handleGraphAssigneeToggle(assignee, isEnabled) {
    let selected = state?.graphAssignees || [];
    if (isEnabled) {
        if (!selected.includes(assignee)) {
            selected = [...selected, assignee];
        }
    } else {
        selected = selected.filter(a => a !== assignee);
    }
    // 直接internalに書き込む（state.graphAssignees setter使用）
    if (state) {
        state.graphAssignees = selected;
    }
    // ボタンテキストを更新
    const toggleBtn = document.getElementById('graphAssigneeToggleBtn');
    if (toggleBtn) {
        if (selected.length === 0) {
            toggleBtn.textContent = '全担当者';
        } else if (selected.length === 1) {
            toggleBtn.textContent = selected[0] + ' ▼';
        } else {
            toggleBtn.textContent = `${selected.length}人選択 ▼`;
        }
    }
    // グラフ再描画（外部関数）
    if (window.refreshGraphPanel) {
        window.refreshGraphPanel();
    }
    // 設定保存（外部関数）
    if (window.saveGraphSettings) {
        window.saveGraphSettings();
    }
}

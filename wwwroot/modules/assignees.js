/**
 * 担当者管理モジュール
 */

import { getCurrentAssignees, getMainAssignee, setMainAssignee, getAssigneeSuggestions,
         addAssigneeToState, removeAssigneeFromState, escapeHtml, setModalState } from './state.js';

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

        const crownIcon = isMain ? '👑 ' : '';
        tag.innerHTML = `${crownIcon}${escapeHtml(assignee)} <span class="remove-assignee" data-index="${i}">&times;</span>`;

        assigneeTagsEl.appendChild(tag);
    });

    // イベント委譲（1回だけ設定）
    assigneeTagsEl.onclick = handleAssigneeTagClick;
}

/**
 * 担当者選択ドロップダウンを描画（設定から取得した一覧）
 */
export function renderAssigneeSelect() {
    const listEl = document.getElementById('assigneeList');
    const toggleBtn = document.getElementById('assigneeToggleBtn');
    if (!listEl || !toggleBtn) return;

    // ドロップダウンを閉じる
    listEl.classList.remove('active');

    listEl.innerHTML = '';

    const allAssignees = getAssigneeSuggestions();
    const currentAssignees = getCurrentAssignees();

    allAssignees.forEach(assignee => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        const isSelected = currentAssignees.includes(assignee);
        if (isSelected) {
            item.classList.add('selected');
        }

        item.innerHTML = `<span class="dropdown-checkmark">✓</span>${escapeHtml(assignee)}`;

        // アイテムクリックで担当者をトグル
        item.addEventListener('click', () => {
            toggleAssignee(assignee);
            renderAssigneeTags();
            renderAssigneeSelect();
        });

        listEl.appendChild(item);
    });

    // ボタンクリックでドロップダウン表示/非表示（addEventListener使用）
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        listEl.classList.toggle('active');
    };
}

/**
 * 担当者をトグル
 */
function toggleAssignee(assignee) {
    const current = getCurrentAssignees();
    const idx = current.indexOf(assignee);

    if (idx >= 0) {
        // 削除
        setModalState({ currentAssignees: current.filter(a => a !== assignee) });
        if (getMainAssignee() === assignee) {
            setMainAssignee(current.filter(a => a !== assignee)[0] || null);
        }
    } else {
        // 追加
        addAssigneeToState(assignee);
    }
}

/**
 * ドロップダウンの変更から担当者配列を更新（後方互換用）
 */
export function syncAssigneesFromSelect() {
    // カスタムドロップダウンでは直接使用しないが、後方互換のため残す
}

/**
 * 子タスク管理モジュール
 * IDベース管理（index依存を排除）
 * ドラッグ＆ドロップで順序入れ替え可能
 */

import { addChildTaskToState, updateChildTaskInState, removeChildTaskFromState, getChildTasks, reorderChildTasks, isTicketLocked } from './state.js';

// ローカルID生成（HTTP環境でも動作）
let childTaskIdCounter = 0;
function generateLocalId() {
    return `local-${Date.now()}-${++childTaskIdCounter}`;
}

// ドラッグ中の子タスクID
let draggedChildId = null;
// dragoverで決定したドロップ先ターゲットID
let pendingDropTargetId = null;
// dragoverで決定した挿入位置（true=ターゲットの前、false=ターゲットの後）
let pendingDropBefore = false;
// コンテナレベルのリスナーは初回のみ追加
let containerListenersInitialized = false;
// ドロップインジケーター（1個のみ管理）
let dropIndicator = null;

/**
 * ドラッグ状態を一括リセット
 */
function resetDragState() {
    draggedChildId = null;
    pendingDropTargetId = null;
    pendingDropBefore = false;
}

/**
 * レビューアイコンのマップ
 */
const REVIEW_ICONS = {
    'none': '📄',
    'editing': '📝',
    'requested': '📑',
    'completed': '✅',
    'thumbsup': '👍',
    'happy': '😄',
    'sad': '😥',
    'shock': '😱'
};

/**
 * レビュー状態のアイコンを取得
 */
function getReviewStateInfo(state) {
    return { icon: REVIEW_ICONS[state] || '📄', title: '' };
}

/**
 * 子タスクを追加
 */
export function addChildTask(text, done = false, id = null, progress = 0, category = '', reviewState = 'none') {
    const task = {
        id: id || generateLocalId(),
        text: text.trim(),
        done,
        progress: progress || 0,
        category: category || '',
        reviewState: reviewState || 'none'
    };
    addChildTaskToState(task);
    renderChildTasks();
}

/**
 * 子タスクを更新（IDベース）
 */
export function updateChildTask(id, updates) {
    updateChildTaskInState(id, updates);
}

/**
 * 子タスクを削除（IDベース）
 */
export function removeChildTask(id) {
    removeChildTaskFromState(id);
    renderChildTasks();
}

/**
 * 子タスクをDOMに追加
 */
function addChildTaskToDom(task) {
    const childTasksEl = document.getElementById('childTasks');
    if (!childTasksEl) return;

    const div = document.createElement('div');
    div.className = 'child-task-item' + (task.done ? ' done' : '');
    div.dataset.childId = task.id;
    div.draggable = true;

    // ドラッグハンドル（🔸）- 左側配置
    const dragHandle = document.createElement('span');
    dragHandle.className = 'child-task-drag-handle';
    dragHandle.textContent = '🔸';
    dragHandle.title = 'ドラッグして順番を入れ替え';

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = task.text;
    textInput.placeholder = '子タスク名';

    // ハンバーガーメニュー（☰）- 右側配置
    const menuBtn = document.createElement('button');
    menuBtn.className = 'child-task-settings-btn';
    menuBtn.textContent = '\u2630'; // ☰
    menuBtn.title = '設定';
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showChildTaskMenu(menuBtn, task, div);
    });

    div.appendChild(dragHandle);
    div.appendChild(textInput);

    // 集計カテゴリ表示
    const categorySpan = document.createElement('span');
    categorySpan.className = 'child-task-category';
    if (task.category) {
        categorySpan.textContent = `[${task.category}]`;
    }
    div.appendChild(categorySpan);

    div.appendChild(menuBtn);
    childTasksEl.appendChild(div);


    textInput.addEventListener('input', () => {
        updateChildTask(task.id, { text: textInput.value });
    });

    // ドラッグ＆ドロップイベント
    div.addEventListener('dragstart', (e) => {
        resetDragState();
        draggedChildId = task.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
        // 遅延してクラスを追加（ドラッグゴースト生成後）
        setTimeout(() => div.classList.add('dragging'), 0);
    });

    div.addEventListener('dragend', () => {
        div.classList.remove('dragging');
        // drop が発生しなくても dragend で移動確定
        // resetDragState 前に移動処理を実行（状態が有効なうちに）
        if (draggedChildId && pendingDropTargetId) {
            performChildTaskMove();
        }
        removeChildTaskDropIndicators();
        resetDragState();
    });

    div.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        if (draggedChildId === task.id) return;

        // マウス位置でインジケーターを要素の上/下に配置
        const rect = div.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
            // 要素の上に挿入
            placeIndicatorBefore(div);
            pendingDropTargetId = task.id;
            pendingDropBefore = true;
        } else {
            // 要素の下に挿入
            placeIndicatorAfter(div);
            pendingDropTargetId = task.id;
            pendingDropBefore = false;
        }
    });
}

let activeChildTaskMenu = null;

/**
 * 子タスクの設定メニューを隠す
 */
function hideChildTaskMenu() {
    if (activeChildTaskMenu) {
        activeChildTaskMenu.remove();
        activeChildTaskMenu = null;
    }
}

/**
 * 子タスクの設定メニューを表示
 */
function showChildTaskMenu(button, task, itemDiv) {
    // 既存のメニューを閉じる
    hideChildTaskMenu();

    const menu = document.createElement('div');
    menu.className = 'child-task-settings-menu';

    const locked = isTicketLocked();

    // 「隠す」メニュー項目（ロック時でも有効）
    const hideItem = document.createElement('div');
    hideItem.className = 'child-task-menu-item';

    const toggleHide = () => {
        const newDone = !task.done;
        updateChildTask(task.id, { done: newDone });
        itemDiv.classList.toggle('done', newDone);
        hideChildTaskMenu();
    };

    hideItem.textContent = task.done ? '✓ 隠す' : '隠す';
    hideItem.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleHide();
    });

    menu.appendChild(hideItem);

    // 「集計カテゴリ編集」メニュー項目（ロック時は無効）
    const categoryItem = document.createElement('div');
    categoryItem.className = 'child-task-menu-item';
    if (locked) {
        categoryItem.classList.add('disabled');
    }
    const categoryName = task.category || '(未設定)';
    categoryItem.textContent = `集計カテゴリ: ${categoryName}`;
    categoryItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (locked) return;
        hideChildTaskMenu();
        const current = task.category || '';
        const input = prompt('子タスクのカテゴリを入力してください', current);
        if (input !== null) {
            updateChildTask(task.id, { category: input.trim() });
            renderChildTasks();
        }
    });
    menu.appendChild(categoryItem);

    // 「削除」メニュー項目（ロック時は無効）
    const deleteItem = document.createElement('div');
    deleteItem.className = 'child-task-menu-item child-task-menu-item-delete';
    if (locked) {
        deleteItem.classList.add('disabled');
    }
    deleteItem.textContent = '削除';
    deleteItem.addEventListener('click', (e) => {
        e.stopPropagation();
        if (locked) return;
        hideChildTaskMenu();
        removeChildTask(task.id);
    });
    menu.appendChild(deleteItem);

    // bodyに追加（position: fixed で配置）
    document.body.appendChild(menu);
    activeChildTaskMenu = menu;

    // メニュー位置設定
    const btnRect = button.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.top = `${btnRect.bottom}px`;
    menu.style.right = `${window.innerWidth - btnRect.right}px`;
    menu.style.left = 'auto';

    // 外クリックで閉じる（一度だけ）
    const clickHandler = (e) => {
        if (!menu.contains(e.target) && !button.contains(e.target)) {
            hideChildTaskMenu();
            document.removeEventListener('click', clickHandler);
        }
    };
    // 現在のクリックイベントが終わってからリスナーを追加
    setTimeout(() => document.addEventListener('click', clickHandler), 0);
}

/**
 * インジケーターをターゲットの前に配置（1個管理）
 */
function placeIndicatorBefore(target) {
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'child-task-drop-indicator';
    }
    target.parentNode.insertBefore(dropIndicator, target);
}

/**
 * インジケーターをターゲットの後に配置（1個管理）
 */
function placeIndicatorAfter(target) {
    if (!dropIndicator) {
        dropIndicator = document.createElement('div');
        dropIndicator.className = 'child-task-drop-indicator';
    }
    target.parentNode.insertBefore(dropIndicator, target.nextSibling);
}

/**
 * 子タスクのドロップインジケーターを削除
 */
function removeChildTaskDropIndicators() {
    if (dropIndicator) {
        dropIndicator.remove();
        dropIndicator = null;
    }
}

/**
 * 子タスクの移動処理を実行（dragend/drop 共通）
 */
function performChildTaskMove() {
    const childTasksEl = document.getElementById('childTasks');
    if (!childTasksEl) return;

    removeChildTaskDropIndicators();

    if (!draggedChildId) return;

    // pendingDropTargetId が設定されていない場合は何もしない
    if (!pendingDropTargetId) {
        return;
    }

    const allStateTasks = getChildTasks();
    let targetIndex;

    if (pendingDropTargetId === '__end__') {
        // 末尾に移動
        targetIndex = allStateTasks.length;
    } else {
        // ターゲット要素のインデックスを取得
        const targetIdx = allStateTasks.findIndex(t => t.id === pendingDropTargetId);
        if (targetIdx < 0) {
            return;
        }
        targetIndex = pendingDropBefore ? targetIdx : targetIdx + 1;
    }

    reorderChildTasks(draggedChildId, targetIndex);
    renderChildTasks();
}

/**
 * 子タスクを再描画
 */
export function renderChildTasks() {
    const childTasksEl = document.getElementById('childTasks');
    if (!childTasksEl) return;
    childTasksEl.innerHTML = '';
    getChildTasks().forEach(task => {
        addChildTaskToDom(task);
    });

    // コンテナレベルのdragover（初回のみ追加）
    if (!containerListenersInitialized) {
        childTasksEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // 直接コンテナ上でのみ末尾に配置（バブリングで子要素から来た場合は無視）
            if (draggedChildId && e.target === childTasksEl) {
                // 末尾インジケーター表示
                if (!dropIndicator) {
                    dropIndicator = document.createElement('div');
                    dropIndicator.className = 'child-task-drop-indicator';
                }
                childTasksEl.appendChild(dropIndicator);
                pendingDropTargetId = '__end__';
                pendingDropBefore = false;
            }
        });

        containerListenersInitialized = true;
    }
}

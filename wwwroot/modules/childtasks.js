/**
 * 子タスク管理モジュール
 * IDベース管理（index依存を排除）
 * ドラッグ＆ドロップで順序入れ替え可能
 */

import { addChildTaskToState, updateChildTaskInState, removeChildTaskFromState, getChildTasks, reorderChildTasks } from './state.js';

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
 * 子タスクを追加
 */
export function addChildTask(text, done = false, id = null, progress = 0) {
    const task = {
        id: id || crypto.randomUUID(),
        text: text.trim(),
        done,
        progress: progress || 0
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

    // ドラッグハンドル（☰）
    const dragHandle = document.createElement('span');
    dragHandle.className = 'child-task-drag-handle';
    dragHandle.textContent = '\u2630'; // ☰
    dragHandle.title = 'ドラッグして順番を入れ替え';

    // XSS対策: innerHTML ではなく createElement/setAttribute を使用
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = task.text;
    textInput.placeholder = '子タスク名';

    // 進捗表示（クリックでスライダー表示）
    const progressSpan = document.createElement('span');
    progressSpan.className = 'child-task-progress';
    progressSpan.textContent = `${task.progress || 0}%`;
    progressSpan.title = 'クリックして進捗率を変更';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-child-task';
    removeBtn.textContent = '\u00d7'; // ×記号

    div.appendChild(dragHandle);
    div.appendChild(checkbox);
    div.appendChild(textInput);
    div.appendChild(progressSpan);
    div.appendChild(removeBtn);
    childTasksEl.appendChild(div);

    // イベント（IDベースでstate更新）
    checkbox.addEventListener('change', () => {
        updateChildTask(task.id, { done: checkbox.checked });
        // 打消し線クラスを更新
        div.classList.toggle('done', checkbox.checked);
    });

    textInput.addEventListener('input', () => {
        updateChildTask(task.id, { text: textInput.value });
    });

    // 進捗スライダー
    progressSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        showChildTaskProgressSlider(progressSpan, task.id, task.progress || 0);
    });

    removeBtn.addEventListener('click', () => {
        removeChildTask(task.id);
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

/**
 * 子タスクの進捗スライダーを表示
 */
function showChildTaskProgressSlider(progressSpan, childId, currentProgress) {
    // 既存のスライダーを削除
    const existing = document.querySelector('.child-task-progress-slider-popup');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.className = 'child-task-progress-slider-popup';
    popup.style.position = 'absolute';
    popup.style.background = 'white';
    popup.style.border = '1px solid rgba(0,0,0,0.15)';
    popup.style.borderRadius = '8px';
    popup.style.padding = '12px 16px';
    popup.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    popup.style.zIndex = '1000';
    popup.style.display = 'flex';
    popup.style.flexDirection = 'column';
    popup.style.alignItems = 'center';
    popup.style.gap = '8px';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '10';
    slider.value = currentProgress;
    slider.style.width = '150px';
    slider.style.cursor = 'pointer';

    const label = document.createElement('span');
    label.style.fontSize = '14px';
    label.style.fontWeight = '600';
    label.style.color = 'rgba(0,0,0,0.8)';
    label.textContent = `${currentProgress}%`;

    slider.addEventListener('input', () => {
        label.textContent = `${slider.value}%`;
    });

    slider.addEventListener('change', () => {
        const newProgress = parseInt(slider.value);
        progressSpan.textContent = `${newProgress}%`;
        updateChildTask(childId, { progress: newProgress });
        popup.remove();
        // 再描画をトリガー
        renderChildTasks();
    });

    popup.appendChild(slider);
    popup.appendChild(label);

    // ポジション設定
    const rect = progressSpan.getBoundingClientRect();
    popup.style.top = `${rect.top - popup.offsetHeight - 8}px`;
    popup.style.left = `${rect.left}px`;

    document.body.appendChild(popup);

    // クリックで閉じる
    const closeHandler = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', closeHandler);
        }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
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

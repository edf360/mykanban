/**
 * 子タスク管理モジュール
 * IDベース管理（index依存を排除）
 * ドラッグ＆ドロップで順序入れ替え可能
 */

import { addChildTaskToState, updateChildTaskInState, removeChildTaskFromState, getChildTasks, reorderChildTasks, isTicketLocked, getEditingTicketId, getTicketProgress, API_BASE, emit } from './state.js';
import { showProgressSlider } from './progressSliderPopup.js';
import { showReviewIconPopup } from './reviewIconPopup.js';
import { apiRequest } from './api.js';

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
    'waiting': '⌛',
    'completed': '✅',
    'thumbsup': '👍',
    'happy': '😄',
    'sad': '😥',
    'sorry': '🙇‍♂️'
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
export function addChildTask(text, done = false, id = null, category = '', memo = '', reviewState = 'none') {
    let taskText = text.trim();
    // 空文字の場合は空のまま保存（DOM側でプレースホルダー表示）
    // blur時に空なら（未設定）になる
    const task = {
        id: id || generateLocalId(),
        text: taskText,
        done,
        category: category || '',
        memo: memo || '',
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
    if (!confirm('この子タスクを削除してもよろしいですか？')) {
        return;
    }
    removeChildTaskFromState(id);
    renderChildTasks();
}

/**
 * 子タスクをDOMに追加
 * レイアウト: ドラッグハンドル → 子タスク名 → 子タスクメモ → 集計ID → 進捗率 → アイコン → 隠すチェック → 削除ボタン
 */
function addChildTaskToDom(task) {
    const childTasksEl = document.getElementById('childTasks');
    if (!childTasksEl) return;

    const div = document.createElement('div');
    div.className = 'child-task-item' + (task.done ? ' done' : '');
    div.dataset.childId = task.id;

    // 選択関数（ドラッグハンドル・名前入力から共通）
    const selectChildTask = () => {
        // 現在のメモパネルの値を保存
        saveChildTaskMemoFromPanel();
        // 他の行の selected クラスを削除
        document.querySelectorAll('.child-task-item.selected').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        updateChildTaskMemoPanel(task);
    };

    // 1. ドラッグハンドル（🔸）- クリックで選択 / ドラッグで順番入れ替え
    const dragHandle = document.createElement('span');
    dragHandle.className = 'child-task-drag-handle';
    dragHandle.textContent = '🔸';
    dragHandle.title = 'クリックで選択 / ドラッグして順番を入れ替え';
    dragHandle.draggable = true;
    dragHandle.addEventListener('click', (e) => {
        e.stopPropagation();
        selectChildTask();
    });

    // 2. 子タスク名（フォーカスで右パネルのメモを更新）
    const textInput = document.createElement('input');
    textInput.type = 'text';
    // 空文字または（未設定）の場合は空文字で表示（プレースホルダー表示）
    textInput.value = (task.text && task.text !== '（未設定）') ? task.text : '';
    textInput.placeholder = '子タスクのタイトル';
    textInput.className = 'child-task-name';
    textInput.addEventListener('focus', selectChildTask);

    // 3. 集計ID（マウスオーバーで表示、クリックでモーダル）
    const categorySpan = document.createElement('span');
    categorySpan.className = 'child-task-category';
    const categoryDisplay = task.category ? task.category : '集計IDなし';
    categorySpan.textContent = categoryDisplay;
    categorySpan.title = '集計時に同じIDのチケットをまとめて表示します';
    categorySpan.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isTicketLocked()) return;
        showChildTaskCategoryModal(task, div);
    });

    // 5. 進捗率（クリックで編集）
    const progressSpan = document.createElement('span');
    progressSpan.className = 'child-task-progress';
    const ticketId = getEditingTicketId();
    progressSpan.textContent = `${getTicketProgress(ticketId, task.id) || 0}%`;
    progressSpan.title = 'クリックして進捗率を変更';
    progressSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        showChildTaskProgressModal(task, div);
    });

    // 6. 子タスクアイコン（レビュー状態）
    const reviewIcon = document.createElement('span');
    reviewIcon.className = 'child-task-review-icon';
    const { icon } = getReviewStateInfo(task.reviewState || 'none');
    reviewIcon.textContent = icon;
    reviewIcon.title = 'クリックしてアイコンを選択';
    reviewIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        showChildTaskReviewModal(task, div);
    });

    // 7. 隠すチェックボックス
    const hideCheckbox = document.createElement('input');
    hideCheckbox.type = 'checkbox';
    hideCheckbox.className = 'child-task-hide-checkbox';
    hideCheckbox.checked = task.done;
    hideCheckbox.title = '隠す';
    hideCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        updateChildTask(task.id, { done: e.target.checked });
        div.classList.toggle('done', e.target.checked);
    });

    // 8. 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'remove-child-task';
    deleteBtn.textContent = '✕';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isTicketLocked()) return;
        removeChildTask(task.id);
    });

    // 要素を順に追加
    div.appendChild(dragHandle);
    div.appendChild(textInput);
    div.appendChild(categorySpan);
    div.appendChild(progressSpan);
    div.appendChild(reviewIcon);
    div.appendChild(hideCheckbox);
    div.appendChild(deleteBtn);
    childTasksEl.appendChild(div);

    textInput.addEventListener('input', () => {
        // 入力中は空文字のまま保存（blur時に（未設定）になる）
        const newText = textInput.value.trim();
        updateChildTask(task.id, { text: newText });
    });
    textInput.addEventListener('blur', () => {
        if (!textInput.value.trim()) {
            textInput.value = '（未設定）';
            updateChildTask(task.id, { text: '（未設定）' });
        }
    });
    textInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            addChildTask('', false);
            // 新しく作成された子タスクのinputにフォーカス
            setTimeout(() => {
                const inputs = childTasksEl.querySelectorAll('input.child-task-name');
                if (inputs.length > 0) {
                    const lastInput = inputs[inputs.length - 1];
                    lastInput.focus();
                }
            }, 50);
        }
    });

    // ドラッグ＆ドロップイベント（ドラッグハンドルからのみ有効）
    dragHandle.addEventListener('dragstart', (e) => {
        resetDragState();
        draggedChildId = task.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.dropEffect = 'move';
        setTimeout(() => div.classList.add('dragging'), 0);
    });

    dragHandle.addEventListener('dragend', () => {
        div.classList.remove('dragging');
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

        const rect = div.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;

        if (e.clientY < midY) {
            placeIndicatorBefore(div);
            pendingDropTargetId = task.id;
            pendingDropBefore = true;
        } else {
            placeIndicatorAfter(div);
            pendingDropTargetId = task.id;
            pendingDropBefore = false;
        }
    });
}

/**
 * 子タスク集計ID編集モーダル
 */
function showChildTaskCategoryModal(task, itemDiv) {
    const current = task.category || '';
    const input = prompt('集計IDを入力してください', current);
    if (input !== null) {
        const category = input.trim();
        updateChildTask(task.id, { category });
        renderChildTasks();
    }
}

/**
 * 子タスク進捗率編集モーダル
 */
async function showChildTaskProgressModal(task, itemDiv) {
    const ticketId = getEditingTicketId();
    const current = getTicketProgress(ticketId, task.id) || 0;
    const progressSpan = itemDiv.querySelector('.child-task-progress');
    if (!progressSpan) return;
    const today = new Date().toISOString().split('T')[0];
    const childTasks = getChildTasks();
    const childTaskIndex = childTasks.findIndex(t => t.id === task.id);
    
    // 今日の進捗・実績時間を取得
    let currentHours = 0;
    let currentProgress = current;
    if (ticketId) {
        try {
            const actuals = await apiRequest('GET', `${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, null);
            const todayActual = actuals.find(a => {
                const actualDate = (a.Date || a.date || '').split('T')[0];
                const dateMatches = actualDate === today;
                const indexMatches = a.ChildTaskIndex === childTaskIndex || a.childTaskIndex === childTaskIndex || childTaskIndex === -1;
                return dateMatches && indexMatches;
            });
            if (todayActual) {
                currentHours = todayActual.Hours ?? todayActual.hours ?? 0;
                currentProgress = todayActual.ProgressRate ?? todayActual.progressRate ?? currentProgress;
            }
        } catch (error) {
            console.error('Failed to load actuals:', error);
        }
    }
    
    showProgressSlider(progressSpan, currentProgress, async (newProgress, newHours) => {
        renderChildTasks();
        
        if (ticketId) {
            try {
                await apiRequest('POST', `${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, {
                    date: today,
                    hours: newHours,
                    progressRate: newProgress,
                    childTaskIndex: childTaskIndex >= 0 ? childTaskIndex : undefined
                });
            } catch (error) {
                console.error('Failed to save actuals:', error);
            }
        }
        
        // SignalRのデバウンスにより再描画がスキップされる可能性があるため明示的に再描画（イベントバス経由）
        emit('render-tickets');
    }, ticketId, today, childTaskIndex >= 0 ? childTaskIndex : null, currentHours);
}

/**
 * 子タスクレビューアイコン選択モーダル
 */
function showChildTaskReviewModal(task, itemDiv) {
    const current = task.reviewState || 'none';
    const reviewIcon = itemDiv.querySelector('.child-task-review-icon');
    if (!reviewIcon) return;
    
    showReviewIconPopup(reviewIcon, current, (newState) => {
        updateChildTask(task.id, { reviewState: newState });
        renderChildTasks();
    });
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

/**
 * 右パネルの子タスクメモを更新
 */
export function updateChildTaskMemoPanel(task) {
    const childTaskMemo = document.getElementById('childTaskMemoGroup');
    const memoTextarea = document.getElementById('childTaskMemo');
    if (memoTextarea) {
        memoTextarea.value = task.memo || '';
        memoTextarea.dataset.childTaskId = task.id;
    }
    // 子タスク名を表示
    const nameSpan = document.getElementById('childTaskMemoName');
    if (nameSpan) {
        nameSpan.textContent = task.text ? `- ${task.text}` : '';
    }
    // 子タスクメモ領域を表示
    if (childTaskMemo) {
        childTaskMemo.style.display = '';
    }
}

export function clearChildTaskMemoPanel() {
    const childTaskMemo = document.getElementById('childTaskMemoGroup');
    const memoTextarea = document.getElementById('childTaskMemo');
    
    // 現在のメモ内容を保存（次に選択したときに復帰するため）
    if (memoTextarea) {
        const childTaskId = memoTextarea.dataset.childTaskId;
        if (childTaskId) {
            updateChildTaskInState(childTaskId, { memo: memoTextarea.value });
        }
        memoTextarea.value = '';
        delete memoTextarea.dataset.childTaskId;
    }
    
    const nameSpan = document.getElementById('childTaskMemoName');
    if (nameSpan) {
        nameSpan.textContent = '';
    }
    // 子タスクメモ領域を非表示
    if (childTaskMemo) {
        childTaskMemo.style.display = 'none';
    }
    // 子タスクの選択状態を解除
    document.querySelectorAll('.child-task-item.selected').forEach(el => el.classList.remove('selected'));
}

/**
 * 右パネルから子タスクのメモを保存
 */
export function saveChildTaskMemoFromPanel() {
    const memoTextarea = document.getElementById('childTaskMemo');
    if (!memoTextarea) return;
    const childTaskId = memoTextarea.dataset.childTaskId;
    if (!childTaskId) return;
    const memo = memoTextarea.value;
    updateChildTaskInState(childTaskId, { memo });
}

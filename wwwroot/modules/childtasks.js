/**
 * 子タスク管理モジュール
 * IDベース管理（index依存を排除）
 */

import { addChildTaskToState, updateChildTaskInState, removeChildTaskFromState, getChildTasks } from './state.js';

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
 * 子タスクを再描画
 */
export function renderChildTasks() {
    const childTasksEl = document.getElementById('childTasks');
    if (!childTasksEl) return;
    childTasksEl.innerHTML = '';
    getChildTasks().forEach(task => {
        addChildTaskToDom(task);
    });
}

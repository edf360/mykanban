/**
 * 子タスク管理モジュール
 * IDベース管理（index依存を排除）
 */

import { addChildTaskToState, updateChildTaskInState, removeChildTaskFromState, getChildTasks } from './state.js';

/**
 * 子タスクを追加
 */
export function addChildTask(text, done = false, id = null) {
    const task = {
        id: id || crypto.randomUUID(),
        text: text.trim(),
        done
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
    div.className = 'child-task-item';
    div.dataset.childId = task.id;

    // XSS対策: innerHTML ではなく createElement/setAttribute を使用
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;

    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = task.text;
    textInput.placeholder = '子タスク名';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-child-task';
    removeBtn.textContent = '\u00d7'; // ×記号

    div.appendChild(checkbox);
    div.appendChild(textInput);
    div.appendChild(removeBtn);
    childTasksEl.appendChild(div);

    // イベント（IDベースでstate更新）
    checkbox.addEventListener('change', () => {
        updateChildTask(task.id, { done: checkbox.checked });
    });

    textInput.addEventListener('input', () => {
        updateChildTask(task.id, { text: textInput.value });
    });

    removeBtn.addEventListener('click', () => {
        removeChildTask(task.id);
    });
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

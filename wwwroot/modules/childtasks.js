/**
 * 子タスク管理モジュール
 */

import { state, escapeHtml } from './state.js';

/**
 * 子タスクを追加
 */
export function addChildTask(text, done = false, index = null) {
    const task = { text: text.trim(), done };
    if (index !== null) {
        state.currentChildTasks.splice(index, 1, task);
    } else {
        state.currentChildTasks.push(task);
    }
    renderChildTasks();
}

/**
 * 子タスクを削除
 */
export function removeChildTask(index) {
    state.currentChildTasks.splice(index, 1);
    renderChildTasks();
}

/**
 * 子タスクをDOMに追加
 */
export function addChildTaskToDom(text = '', done = false, index) {
    const childTasksEl = document.getElementById('childTasks');
    const div = document.createElement('div');
    div.className = 'child-task-item';
    div.dataset.index = index;
    
    // XSS対策: innerHTML ではなく createElement/setAttribute を使用
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = done;
    checkbox.dataset.childIndex = index;
    
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.value = text; // createElement で生成するためXSS安全
    textInput.placeholder = '子タスク名';
    textInput.dataset.childText = index;
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-child-task';
    removeBtn.dataset.removeChild = index;
    removeBtn.textContent = '\u00d7'; // ×記号
    
    div.appendChild(checkbox);
    div.appendChild(textInput);
    div.appendChild(removeBtn);
    childTasksEl.appendChild(div);
    
    // イベント（上部で定義した変数を直接使用）
    checkbox.addEventListener('change', () => {
        state.currentChildTasks[index].done = checkbox.checked;
    });
    
    textInput.addEventListener('input', () => {
        state.currentChildTasks[index].text = textInput.value;
    });
    
    removeBtn.addEventListener('click', () => {
        removeChildTask(index);
    });
}

/**
 * 子タスクを再描画
 */
export function renderChildTasks() {
    const childTasksEl = document.getElementById('childTasks');
    childTasksEl.innerHTML = '';
    state.currentChildTasks.forEach((task, i) => {
        addChildTaskToDom(task.text, task.done, i);
    });
}

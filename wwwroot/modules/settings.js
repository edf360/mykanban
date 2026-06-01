// 設定パネル管理モジュール
import { apiRequest } from './api.js';
import { requireAdmin, getToken } from './auth.js';
import { renderAllTickets } from './renderer.js';

// 設定データ
let settings = { users: [], labels: [], holidays: [] };
let isOpen = false;

// グローバルオブジェクト（renderer.js / labels.js から Settings.settings() でアクセス）
window.Settings = {
    settings: () => settings
};

// ドラッグ＆ドロップ用変数
let dragItem = null;
let dragType = null; // 'users' or 'labels'

/**
 * 設定を読み込む
 */
export async function load() {
    try {
        const response = await apiRequest('GET', '/api/settings', null);
        settings = response || { users: [], labels: [], holidays: [] };
        if (!settings.users) settings.users = [];
        if (!settings.labels) settings.labels = [];
        if (!settings.holidays) settings.holidays = [];
    } catch (e) {
        console.error('設定の読み込みに失敗', e);
        settings = { users: [], labels: [], holidays: [] };
    }
}

/**
 * 設定を保存する
 */
export async function save() {
    try {
        await apiRequest('PUT', '/api/settings', settings);
    } catch (e) {
        console.error('設定の保存到失敗', e);
        alert('設定の保存到失敗しました。');
    }
}

/**
 * 設定データを取得する
 */
export function getSettings() {
    return settings;
}

/**
 * 設定パネルを開く
 */
export async function open() {
    console.log('[Settings] open called');
    // 管理者チェック
    if (!requireAdmin()) {
        return;
    }
    await load();
    renderUsers();
    renderLabels();
    renderHolidays();

    const panel = document.getElementById('settingsPanel');
    const btn = document.getElementById('settingsBtn');
    console.log('[Settings] panel element:', panel, 'btn element:', btn);
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    isOpen = true;
    console.log('[Settings] panel active:', panel ? panel.classList.contains('active') : 'N/A');
}

/**
 * 設定パネルを閉じる
 */
export function close() {
    const panel = document.getElementById('settingsPanel');
    const btn = document.getElementById('settingsBtn');
    if (panel) panel.classList.remove('active');
    if (btn) btn.classList.remove('active');
    isOpen = false;
}

/**
 * ユーザリストをレンダリング
 */
function renderUsers() {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = '';
    settings.users.forEach((user, index) => {
        const item = createUserItem(user, index);
        container.appendChild(item);
    });
}

/**
 * ラベルリストをレンダリング
 */
function renderLabels() {
    const container = document.getElementById('labelsList');
    if (!container) return;
    container.innerHTML = '';
    settings.labels.forEach((label, index) => {
        const item = createLabelItem(index, label.name, label.color);
        container.appendChild(item);
    });
}

/**
 * ラベルアイテム要素を作成（インライン編集対応）
 */
function createLabelItem(index, name, color) {
    const item = document.createElement('div');
    item.className = 'settings-item';
    item.dataset.type = 'labels';
    item.dataset.index = index;

    // 表示モードの要素
    const displayEl = document.createElement('div');
    displayEl.className = 'label-display';
    displayEl.style.display = 'flex';
    displayEl.style.alignItems = 'center';
    displayEl.style.gap = '8px';
    displayEl.style.flex = '1';

    // 色プレビュー
    const colorPreview = document.createElement('div');
    colorPreview.className = 'settings-item-color';
    colorPreview.style.backgroundColor = color || '#808080';

    // 名前
    const nameSpan = document.createElement('span');
    nameSpan.className = 'settings-item-name';
    nameSpan.textContent = name;

    displayEl.appendChild(colorPreview);
    displayEl.appendChild(nameSpan);
    item.appendChild(displayEl);

    // 編集モードの要素（非表示）
    const editEl = document.createElement('div');
    editEl.className = 'label-edit';
    editEl.style.display = 'none';
    editEl.style.alignItems = 'center';
    editEl.style.gap = '8px';
    editEl.style.flex = '1';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'label-edit-name';
    nameInput.value = name;
    nameInput.placeholder = 'ラベル名';
    nameInput.style.flex = '1';
    nameInput.style.padding = '4px 8px';
    nameInput.style.border = '1px solid #e2e8f0';
    nameInput.style.borderRadius = '4px';
    nameInput.style.fontSize = '0.9rem';

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'label-edit-color';
    colorInput.value = color || '#808080';
    colorInput.style.width = '32px';
    colorInput.style.height = '32px';
    colorInput.style.border = '1px solid #e2e8f0';
    colorInput.style.borderRadius = '4px';
    colorInput.style.cursor = 'pointer';
    colorInput.style.padding = '2px';

    editEl.appendChild(nameInput);
    editEl.appendChild(colorInput);
    item.appendChild(editEl);

    // アクションボタン
    const actions = document.createElement('div');
    actions.className = 'settings-item-actions';

    // 編集ボタン（表示モード時）
    const editBtn = document.createElement('button');
    editBtn.className = 'settings-item-btn edit';
    editBtn.textContent = '✎';
    editBtn.title = '編集';
    editBtn.addEventListener('click', () => {
        startInlineEdit(item, displayEl, editEl, nameInput, colorInput, index);
    });
    actions.appendChild(editBtn);

    // 保存ボタン（編集モード時）
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-item-btn save';
    saveBtn.textContent = '✓';
    saveBtn.title = '保存';
    saveBtn.style.display = 'none';
    saveBtn.addEventListener('click', () => {
        finishInlineEdit(index, nameInput.value, colorInput.value);
    });
    actions.appendChild(saveBtn);

    // キャンセルボタン（編集モード時）
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-item-btn cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'キャンセル';
    cancelBtn.style.display = 'none';
    cancelBtn.addEventListener('click', () => {
        cancelInlineEdit(item, displayEl, editEl, nameSpan, colorPreview, name);
    });
    actions.appendChild(cancelBtn);

    // 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'settings-item-btn delete';
    deleteBtn.textContent = '✕';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => {
        if (confirm(`「${name}」を削除しますか？\n既存の割り当てには影響しません。`)) {
            settings.labels.splice(index, 1);
            renderLabels();
            save();
            renderAllTickets();
        }
    });
    actions.appendChild(deleteBtn);

    item.appendChild(actions);

    // ドラッグ＆ドロップイベント
    item.draggable = true;
    item.addEventListener('dragstart', (e) => {
        if (editEl.style.display !== 'none') {
            e.preventDefault();
            return;
        }
        dragItem = index;
        dragType = 'labels';
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        dragItem = null;
        dragType = null;
    });

    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragType === 'labels' && dragItem !== index) {
            e.dataTransfer.dropEffect = 'move';
            item.style.borderTop = '2px solid #3b82f6';
        }
    });

    item.addEventListener('dragleave', () => {
        item.style.borderTop = '';
    });

    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.style.borderTop = '';
        if (dragType === 'labels' && dragItem !== null && dragItem !== index) {
            const moved = settings.labels.splice(dragItem, 1)[0];
            settings.labels.splice(index, 0, moved);
            renderLabels();
            save();
            renderAllTickets();
        }
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishInlineEdit(index, nameInput.value, colorInput.value);
        }
    });

    return item;
}

/**
 * インライン編集を開始
 */
function startInlineEdit(item, displayEl, editEl, nameInput, colorInput, index) {
    displayEl.style.display = 'none';
    editEl.style.display = 'flex';
    item.draggable = false;

    const actions = item.querySelector('.settings-item-actions');
    const editBtn = actions.querySelector('.edit');
    const saveBtn = actions.querySelector('.save');
    const cancelBtn = actions.querySelector('.cancel');
    editBtn.style.display = 'none';
    saveBtn.style.display = '';
    cancelBtn.style.display = '';

    nameInput.focus();
    nameInput.select();
}

/**
 * インライン編集を確定
 */
function finishInlineEdit(index, newName, newColor) {
    const name = newName.trim();
    if (!name) return;

    if (settings.labels.some((l, i) => i !== index && l.name === name)) {
        alert('既に存在するラベル名です。');
        return;
    }

    settings.labels[index].name = name;
    settings.labels[index].color = newColor;
    renderLabels();
    save();
    renderAllTickets();
}

/**
 * インライン編集をキャンセル
 */
function cancelInlineEdit(item, displayEl, editEl, nameSpan, colorPreview, originalName) {
    displayEl.style.display = 'flex';
    editEl.style.display = 'none';
    item.draggable = true;

    const actions = item.querySelector('.settings-item-actions');
    const editBtn = actions.querySelector('.edit');
    const saveBtn = actions.querySelector('.save');
    const cancelBtn = actions.querySelector('.cancel');
    editBtn.style.display = '';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

/**
 * 休日テキストエリアをレンダリング
 */
function renderHolidays() {
    const textarea = document.getElementById('holidaysTextarea');
    if (textarea) {
        textarea.value = settings.holidays.join('\n');
    }
}

/**
 * ユーザーアイテム要素作成（インライン編集対応）
 */
function createUserItem(name, index) {
    const item = document.createElement('div');
    item.className = 'settings-item';
    item.draggable = true;
    item.dataset.type = 'users';
    item.dataset.index = index;

    // 表示モードの要素
    const displayEl = document.createElement('span');
    displayEl.className = 'settings-item-name';
    displayEl.textContent = name;

    // 編集モードの要素（非表示）
    const editEl = document.createElement('div');
    editEl.style.display = 'none';
    editEl.style.flex = '1';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.value = name;
    nameInput.placeholder = 'ユーザー名';
    nameInput.style.flex = '1';
    nameInput.style.padding = '4px 8px';
    nameInput.style.border = '1px solid #e2e8f0';
    nameInput.style.borderRadius = '4px';
    nameInput.style.fontSize = '0.9rem';

    editEl.appendChild(nameInput);
    item.appendChild(displayEl);
    item.appendChild(editEl);

    // アクションボタン
    const actions = document.createElement('div');
    actions.className = 'settings-item-actions';

    // 編集ボタン（表示モード時）
    const editBtn = document.createElement('button');
    editBtn.className = 'settings-item-btn edit';
    editBtn.textContent = '✎';
    editBtn.title = '編集';
    editBtn.addEventListener('click', () => {
        startUserInlineEdit(item, displayEl, editEl, nameInput, index);
    });
    actions.appendChild(editBtn);

    // 保存ボタン（編集モード時）
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-item-btn save';
    saveBtn.textContent = '✓';
    saveBtn.title = '保存';
    saveBtn.style.display = 'none';
    saveBtn.addEventListener('click', () => {
        finishUserInlineEdit(index, nameInput.value);
    });
    actions.appendChild(saveBtn);

    // キャンセルボタン（編集モード時）
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-item-btn cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'キャンセル';
    cancelBtn.style.display = 'none';
    cancelBtn.addEventListener('click', () => {
        cancelUserInlineEdit(item, displayEl, editEl, displayEl, name);
    });
    actions.appendChild(cancelBtn);

    // 削除ボタン
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'settings-item-btn delete';
    deleteBtn.textContent = '✕';
    deleteBtn.title = '削除';
    deleteBtn.addEventListener('click', () => {
        if (confirm(`「${name}」を削除しますか？\n既存の割り当てには影響しません。`)) {
            settings.users.splice(index, 1);
            renderUsers();
            save();
            renderAllTickets();
        }
    });
    actions.appendChild(deleteBtn);
    item.appendChild(actions);

    // ドラッグ＆ドロップイベント
    item.addEventListener('dragstart', (e) => {
        if (editEl.style.display !== 'none') {
            e.preventDefault();
            return;
        }
        dragItem = index;
        dragType = 'users';
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        dragItem = null;
        dragType = null;
    });

    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragType === 'users' && dragItem !== index) {
            e.dataTransfer.dropEffect = 'move';
            item.style.borderTop = '2px solid #3b82f6';
        }
    });

    item.addEventListener('dragleave', () => {
        item.style.borderTop = '';
    });

    item.addEventListener('drop', (e) => {
        e.preventDefault();
        item.style.borderTop = '';
        if (dragType === 'users' && dragItem !== null && dragItem !== index) {
            const moved = settings.users.splice(dragItem, 1)[0];
            settings.users.splice(index, 0, moved);
            renderUsers();
            save();
            renderAllTickets();
        }
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishUserInlineEdit(index, nameInput.value);
        }
    });

    return item;
}

/**
 * ユーザーのインライン編集を開始
 */
function startUserInlineEdit(item, displayEl, editEl, nameInput, index) {
    displayEl.style.display = 'none';
    editEl.style.display = 'block';
    item.draggable = false;

    const actions = item.querySelector('.settings-item-actions');
    const editBtn = actions.querySelector('.edit');
    const saveBtn = actions.querySelector('.save');
    const cancelBtn = actions.querySelector('.cancel');
    editBtn.style.display = 'none';
    saveBtn.style.display = '';
    cancelBtn.style.display = '';

    nameInput.focus();
    nameInput.select();
}

/**
 * ユーザーのインライン編集を確定
 */
function finishUserInlineEdit(index, newName) {
    const name = newName.trim();
    if (!name) return;

    if (settings.users.some((u, i) => i !== index && u === name)) {
        alert('既に存在するユーザ名です。');
        return;
    }

    settings.users[index] = name;
    renderUsers();
    save();
    renderAllTickets();
}

/**
 * ユーザーのインライン編集をキャンセル
 */
function cancelUserInlineEdit(item, displayEl, editEl, nameSpan, originalName) {
    displayEl.style.display = '';
    editEl.style.display = 'none';
    item.draggable = true;

    const actions = item.querySelector('.settings-item-actions');
    const editBtn = actions.querySelector('.edit');
    const saveBtn = actions.querySelector('.save');
    const cancelBtn = actions.querySelector('.cancel');
    editBtn.style.display = '';
    saveBtn.style.display = 'none';
    cancelBtn.style.display = 'none';
}

/**
 * ユーザを追加
 */
function addUser() {
    const input = document.getElementById('newUserInput');
    const name = input.value.trim();
    if (!name) return;
    if (settings.users.includes(name)) {
        alert('既に存在するユーザ名です。');
        return;
    }
    settings.users.push(name);
    input.value = '';
    renderUsers();
    save();
    renderAllTickets();
}

/**
 * ラベルを追加（新規のみ）
 */
function addLabel() {
    const nameInput = document.getElementById('newLabelNameInput');
    const colorInput = document.getElementById('newLabelColorInput');
    const name = nameInput.value.trim();
    if (!name) return;
    
    if (settings.labels.some(l => l.name === name)) {
        alert('既に存在するラベル名です。');
        return;
    }
    
    settings.labels.push({ name, color: colorInput.value });
    nameInput.value = '';
    colorInput.value = '#808080';
    renderLabels();
    save();
    renderAllTickets();
}

/**
 * 休日を保存（textarea変更時）
 */
function saveHolidays() {
    const textarea = document.getElementById('holidaysTextarea');
    const lines = textarea.value.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0 && /^\d{8}$/.test(l));
    settings.holidays = lines;
    save();
}

/**
 * DBエクスポート
 */
async function exportDb() {
    try {
        const headers = {};
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch('/api/settings/export', { method: 'POST', headers });
        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: '不明なエラー' }));
            throw new Error(err.error || 'エクスポートに失敗しました');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;

        // Content-Dispositionからファイル名を取得
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'kanban_backup.json';
        if (contentDisposition && contentDisposition.includes('filename=')) {
            filename = contentDisposition.split('filename=')[1].trim();
        }
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (e) {
        alert(`エクスポートに失敗しました: ${e.message}`);
    }
}

/**
 * DBインポート
 */
async function importDb() {
    const fileInput = document.getElementById('importFileInput');
    fileInput.click();
}

/**
 * ファイル選択後の処理
 */
async function handleImportFile(file) {
    if (!file) return;
    if (!confirm('現在のデータをすべて上書きしますか？\nこの操作は元に戻せません。')) {
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const headers = {};
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/settings/import', {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: '不明なエラー' }));
            throw new Error(err.error || 'インポートに失敗しました');
        }

        alert('インポートが完了しました。ページを再読み込みします。');
        location.reload();
    } catch (e) {
        alert(`インポートに失敗しました: ${e.message}`);
    }
}

/**
 * CSVインポート
 */
async function importCsv() {
    const fileInput = document.getElementById('importCsvFileInput');
    fileInput.click();
}

/**
 * CSVファイル選択後の処理
 */
async function handleCsvImport(file) {
    if (!file) return;
    if (!confirm('CSVからチケットをインポートしますか？\n既存のチケットは更新され、新規チケットは追加されます。')) {
        return;
    }

    try {
        const formData = new FormData();
        formData.append('file', file);

        const headers = {};
        const token = getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const response = await fetch('/api/settings/import-csv', {
            method: 'POST',
            headers,
            body: formData
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({ error: '不明なエラー' }));
            throw new Error(err.error || 'インポートに失敗しました');
        }

        const result = await response.json();
        alert(`インポートが完了しました。${result.count}件のチケットを処理しました。`);
        location.reload();
    } catch (e) {
        alert(`インポートに失敗しました: ${e.message}`);
    }
}

/**
 * イベントバインド
 */
function bindEvents() {
    const bind = (id, event, handler) => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener(event, handler);
        }
    };

    // 開閉ボタン
    bind('settingsBtn', 'click', async () => {
        if (isOpen) {
            close();
        } else {
            await open();
        }
    });
    bind('settingsCloseBtn', 'click', close);

    // ユーザ追加
    bind('addUserBtn', 'click', addUser);
    bind('newUserInput', 'keydown', (e) => {
        if (e.key === 'Enter') addUser();
    });

    // ラベル追加
    bind('addLabelBtn', 'click', addLabel);
    bind('newLabelNameInput', 'keydown', (e) => {
        if (e.key === 'Enter') addLabel();
    });

    // 休日保存（blur時）
    bind('holidaysTextarea', 'blur', saveHolidays);

    // DBエクスポート/インポート
    bind('exportDbBtn', 'click', exportDb);
    bind('importDbBtn', 'click', importDb);
    bind('importFileInput', 'change', (e) => {
        if (e.target.files.length > 0) {
            handleImportFile(e.target.files[0]);
            e.target.value = ''; // リセット
        }
    });

    // CSVインポート
    bind('importCsvBtn', 'click', importCsv);
    bind('importCsvFileInput', 'change', (e) => {
        if (e.target.files.length > 0) {
            handleCsvImport(e.target.files[0]);
            e.target.value = ''; // リセット
        }
    });
}

/**
 * 初期化
 */
export function init() {
    bindEvents();
}

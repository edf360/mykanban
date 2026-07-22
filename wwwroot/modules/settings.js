// 設定パネル管理モジュール
import { apiRequest, loadSuggestions } from './api.js';
import { isAdmin, getToken } from './auth.js';
import { invalidateLabelColorCache, closeGraphPanel, emit } from './state.js';

// ローカルID生成（HTTP環境でも動作）
let localIdCounter = 0;
function generateLocalId() {
    return `local-${Date.now()}-${++localIdCounter}`;
}

// 設定データ
// users: { id, name } のオブジェクト配列（APIとのやり取りで変換）
// labels: { id, name, color } のオブジェクト配列
let settings = { users: [], labels: [], holidays: [] };
let isOpen = false;

// グローバルオブジェクト（renderer.js / labels.js から Settings.settings() でアクセス）
window.Settings = {
    settings: () => settings
};

// ドラッグ＆ドロップ用変数（IDベース）
let dragItemId = null;
let dragType = null; // 'users' or 'labels'

// インライン編集状態（外部ステート管理）
let editingState = {
    type: null,    // 'label' | 'user' | null
    id: null,      // 編集中アイテムのID
    originalData: null  // キャンセル用元データ
};

// 現在の管理者状態（open()で取得した値を共有）
let currentAdminState = false;

/**
 * 設定を読み込む
 */
export async function load() {
    try {
        const response = await apiRequest('GET', '/api/settings', null);
        settings = response || { users: [], labels: [], holidays: [], memos: {} };
        if (!settings.users) settings.users = [];
        if (!settings.labels) settings.labels = [];
        if (!settings.holidays) settings.holidays = [];
        if (!settings.memos) settings.memos = {};
        
        // APIから読み込んだusers（文字列配列）を { id, name } へ変換
        settings.users = settings.users.map(u => {
            if (typeof u === 'string') {
                return { id: generateLocalId(), name: u };
            }
            return u;
        });
        
        // labelsにidがない場合は付与
        settings.labels = settings.labels.map(l => {
            if (!l.id) {
                return { ...l, id: generateLocalId() };
            }
            return l;
        });
    } catch (e) {
        console.error('設定の読み込みに失敗', e);
        settings = { users: [], labels: [], holidays: [], memos: {} };
    }
}

/**
 * 設定を保存する
 */
export async function save() {
    try {
        // API送信時にusersを { id, name } → name のみへ変換
        const payload = {
            users: settings.users.map(u => u.name),
            labels: settings.labels.map(l => ({ name: l.name, color: l.color })),
            holidays: settings.holidays,
            memos: settings.memos
        };
        await apiRequest('PUT', '/api/settings', payload);
        // サジェストを再ロードして最新の状態に更新
        await loadSuggestions();
    } catch (e) {
        console.error('設定の保存に失敗', e);
        alert('設定の保存に失敗しました。');
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
    // グラフパネルが開いている場合は閉じる
    closeGraphPanel();
    await load();
    currentAdminState = isAdmin();
    renderUsers(currentAdminState);
    renderLabels(currentAdminState);
    renderHolidays(currentAdminState);

    // 管理者のみ機能の表示/非表示
    const holidaysSection = document.querySelector('#holidaysTextarea')?.closest('.settings-section');
    if (holidaysSection) {
        holidaysSection.style.display = currentAdminState ? '' : 'none';
    }

    const importDbBtn = document.getElementById('importDbBtn');
    const importCsvBtn = document.getElementById('importCsvBtn');
    if (importDbBtn) importDbBtn.style.display = currentAdminState ? '' : 'none';
    if (importCsvBtn) importCsvBtn.style.display = currentAdminState ? '' : 'none';

    const modal = document.getElementById('settingsModal');
    const btn = document.getElementById('settingsBtn');
    console.log('[Settings] modal element:', modal, 'btn element:', btn);
    if (modal) modal.classList.add('active');
    if (btn) btn.classList.add('active');
    isOpen = true;
    console.log('[Settings] modal active:', modal ? modal.classList.contains('active') : 'N/A');
}

/**
 * 設定モーダルを閉じる
 */
export function close() {
    const modal = document.getElementById('settingsModal');
    const btn = document.getElementById('settingsBtn');
    if (modal) modal.classList.remove('active');
    if (btn) btn.classList.remove('active');
    isOpen = false;
    // 編集状態をクリア
    editingState = { type: null, id: null, originalData: null };
}

/**
 * 共通検証関数 - ラベル名
 */
function validateLabelName(name, excludeId = null) {
    const trimmed = name.trim();
    if (!trimmed) return { valid: false, message: '名前は必須です。' };
    const duplicate = settings.labels.some(l =>
        l.id !== excludeId && l.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) return { valid: false, message: '既に存在するラベル名です。' };
    return { valid: true };
}

/**
 * 共通検証関数 - ユーザー名
 */
function validateUserName(name, excludeId = null) {
    const trimmed = name.trim();
    if (!trimmed) return { valid: false, message: '名前は必須です。' };
    const duplicate = settings.users.some(u =>
        u.id !== excludeId && u.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) return { valid: false, message: '既に存在するユーザ名です。' };
    return { valid: true };
}

/**
 * ユーザリストをレンダリング
 */
function renderUsers(admin) {
    const container = document.getElementById('usersList');
    if (!container) return;
    container.innerHTML = '';
    settings.users.forEach((user) => {
        const item = createUserItem(user, admin);
        container.appendChild(item);
    });
}

/**
 * ラベルリストをレンダリング
 */
function renderLabels(admin) {
    const container = document.getElementById('labelsList');
    if (!container) return;
    container.innerHTML = '';
    settings.labels.forEach((label) => {
        const item = createLabelItem(label, admin);
        container.appendChild(item);
    });
}

/**
 * ラベルアイテム要素を作成（インライン編集対応）
 * @param {boolean} admin - 管理者かどうか。非管理者は名前変更・削除不可、色変更のみ可
 */
function createLabelItem(label, admin) {
    const { id, name, color } = label;
    const isEditing = editingState.type === 'label' && editingState.id === id;
    
    const item = document.createElement('div');
    item.className = 'settings-item';
    item.dataset.type = 'labels';
    item.dataset.id = id;

    // 表示モードの要素
    const displayEl = document.createElement('div');
    displayEl.className = 'label-display';
    displayEl.style.display = isEditing ? 'none' : 'flex';
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

    // 編集モードの要素
    const editEl = document.createElement('div');
    editEl.className = 'label-edit';
    editEl.style.display = isEditing ? 'flex' : 'none';
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

    // 非管理者は名前変更不可
    if (!admin && isEditing) {
        nameInput.disabled = true;
        nameInput.style.opacity = '0.5';
    }

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
    editBtn.style.display = isEditing ? 'none' : '';
    editBtn.addEventListener('click', () => {
        startLabelInlineEdit(id, name, color, admin);
    });
    actions.appendChild(editBtn);

    // 保存ボタン（編集モード時）
    const saveBtn = document.createElement('button');
    saveBtn.className = 'settings-item-btn save';
    saveBtn.textContent = '✓';
    saveBtn.title = '保存';
    saveBtn.style.display = isEditing ? '' : 'none';
    saveBtn.addEventListener('click', () => {
        finishLabelInlineEdit(id, nameInput.value, colorInput.value, admin);
    });
    actions.appendChild(saveBtn);

    // キャンセルボタン（編集モード時）
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'settings-item-btn cancel';
    cancelBtn.textContent = '✕';
    cancelBtn.title = 'キャンセル';
    cancelBtn.style.display = isEditing ? '' : 'none';
    cancelBtn.addEventListener('click', () => {
        cancelLabelInlineEdit(id);
    });
    actions.appendChild(cancelBtn);

    // 削除ボタン - 管理者のみ表示
    if (admin) {
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'settings-item-btn delete';
        deleteBtn.textContent = '✕';
        deleteBtn.title = '削除';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`「${name}」を削除しますか？\n既存の割り当てには影響しません。`)) {
                settings.labels = settings.labels.filter(l => l.id !== id);
                renderLabels(currentAdminState);
                save();
                invalidateLabelColorCache();
                emit('render-tickets');
            }
        });
        actions.appendChild(deleteBtn);
    }

    item.appendChild(actions);

    // ドラッグ＆ドロップイベント（IDベース）
    item.draggable = !isEditing;
    item.addEventListener('dragstart', (e) => {
        if (isEditing) {
            e.preventDefault();
            return;
        }
        dragItemId = id;
        dragType = 'labels';
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        dragItemId = null;
        dragType = null;
    });

    item.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (dragType === 'labels' && dragItemId !== id) {
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
        if (dragType === 'labels' && dragItemId !== null && dragItemId !== id) {
            // IDベースで位置を交換
            const fromIndex = settings.labels.findIndex(l => l.id === dragItemId);
            const toIndex = settings.labels.findIndex(l => l.id === id);
            if (fromIndex !== -1 && toIndex !== -1) {
                const [moved] = settings.labels.splice(fromIndex, 1);
                settings.labels.splice(toIndex, 0, moved);
                renderLabels(currentAdminState);
                save();
                invalidateLabelColorCache();
                emit('render-tickets');
            }
        }
    });

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishLabelInlineEdit(id, nameInput.value, colorInput.value, admin);
        }
    });

    return item;
}

/**
 * ラベルのインライン編集を開始
 */
function startLabelInlineEdit(id, name, color, admin) {
    editingState = {
        type: 'label',
        id: id,
        originalData: { name, color }
    };
    renderLabels(currentAdminState);
}

/**
 * ラベルのインライン編集を確定
 */
function finishLabelInlineEdit(id, newName, newColor, admin) {
    const label = settings.labels.find(l => l.id === id);
    if (!label) return;

    if (admin) {
        const validation = validateLabelName(newName, id);
        if (!validation.valid) {
            alert(validation.message);
            return;
        }
        label.name = newName.trim();
    }
    // 色変更は管理者・非管理者問わず可能
    label.color = newColor;
    
    editingState = { type: null, id: null, originalData: null };
    renderLabels(currentAdminState);
    save();
    invalidateLabelColorCache();
    emit('render-tickets');
}

/**
 * ラベルのインライン編集をキャンセル
 */
function cancelLabelInlineEdit(id) {
    editingState = { type: null, id: null, originalData: null };
    renderLabels(currentAdminState);
}

/**
 * 休日テキストエリアをレンダリング
 */
function renderHolidays(admin) {
    const textarea = document.getElementById('holidaysTextarea');
    if (textarea) {
        textarea.value = settings.holidays.join('\n');
        // 管理者のみ編集可能
        textarea.readOnly = !admin;
    }
}

/**
 * ユーザーアイテム要素作成（インライン編集対応）
 * @param {boolean} admin - 管理者かどうか。非管理者は編集・削除不可
 */
function createUserItem(user, admin) {
    const { id, name } = user;
    const isEditing = editingState.type === 'user' && editingState.id === id;

    const item = document.createElement('div');
    item.className = 'settings-item';
    item.dataset.type = 'users';
    item.dataset.id = id;

    // 表示モードの要素
    const displayEl = document.createElement('span');
    displayEl.className = 'settings-item-name';
    displayEl.textContent = name;
    displayEl.style.display = isEditing ? 'none' : '';

    // 編集モードの要素
    const editEl = document.createElement('div');
    editEl.style.display = isEditing ? 'block' : 'none';
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

    // 管理者のみ編集・削除ボタンを表示
    if (admin) {
        // 編集ボタン（表示モード時）
        const editBtn = document.createElement('button');
        editBtn.className = 'settings-item-btn edit';
        editBtn.textContent = '✎';
        editBtn.title = '編集';
        editBtn.style.display = isEditing ? 'none' : '';
        editBtn.addEventListener('click', () => {
            startUserInlineEdit(id, name);
        });
        actions.appendChild(editBtn);

        // 保存ボタン（編集モード時）
        const saveBtn = document.createElement('button');
        saveBtn.className = 'settings-item-btn save';
        saveBtn.textContent = '✓';
        saveBtn.title = '保存';
        saveBtn.style.display = isEditing ? '' : 'none';
        saveBtn.addEventListener('click', () => {
            finishUserInlineEdit(id, nameInput.value);
        });
        actions.appendChild(saveBtn);

        // キャンセルボタン（編集モード時）
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'settings-item-btn cancel';
        cancelBtn.textContent = '✕';
        cancelBtn.title = 'キャンセル';
        cancelBtn.style.display = isEditing ? '' : 'none';
        cancelBtn.addEventListener('click', () => {
            cancelUserInlineEdit(id);
        });
        actions.appendChild(cancelBtn);

        // 削除ボタン
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'settings-item-btn delete';
        deleteBtn.textContent = '✕';
        deleteBtn.title = '削除';
        deleteBtn.addEventListener('click', () => {
            if (confirm(`「${name}」を削除しますか？\n既存の割り当てには影響しません。`)) {
                settings.users = settings.users.filter(u => u.id !== id);
                renderUsers(currentAdminState);
                save();
                invalidateLabelColorCache();
                emit('render-tickets');
            }
        });
        actions.appendChild(deleteBtn);
    }
    item.appendChild(actions);

    // ドラッグ＆ドロップイベント（管理者のみ、IDベース）
    if (admin) {
        item.draggable = !isEditing;
        item.addEventListener('dragstart', (e) => {
            if (isEditing) {
                e.preventDefault();
                return;
            }
            dragItemId = id;
            dragType = 'users';
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            dragItemId = null;
            dragType = null;
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (dragType === 'users' && dragItemId !== id) {
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
            if (dragType === 'users' && dragItemId !== null && dragItemId !== id) {
                // IDベースで位置を交換
                const fromIndex = settings.users.findIndex(u => u.id === dragItemId);
                const toIndex = settings.users.findIndex(u => u.id === id);
                if (fromIndex !== -1 && toIndex !== -1) {
                    const [moved] = settings.users.splice(fromIndex, 1);
                    settings.users.splice(toIndex, 0, moved);
                    renderUsers(currentAdminState);
                    save();
                    invalidateLabelColorCache();
                    emit('render-tickets');
                }
            }
        });
    }

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishUserInlineEdit(id, nameInput.value);
        }
    });

    return item;
}

/**
 * ユーザーのインライン編集を開始
 */
function startUserInlineEdit(id, name) {
    editingState = {
        type: 'user',
        id: id,
        originalData: { name }
    };
    renderUsers(currentAdminState);
}

/**
 * ユーザーのインライン編集を確定
 */
function finishUserInlineEdit(id, newName) {
    const user = settings.users.find(u => u.id === id);
    if (!user) return;

    const validation = validateUserName(newName, id);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }

    user.name = newName.trim();
    editingState = { type: null, id: null, originalData: null };
    renderUsers(currentAdminState);
    save();
    invalidateLabelColorCache();
    emit('render-tickets');
}

/**
 * ユーザーのインライン編集をキャンセル
 */
function cancelUserInlineEdit(id) {
    editingState = { type: null, id: null, originalData: null };
    renderUsers(currentAdminState);
}

/**
 * ユーザを追加
 */
function addUser() {
    const input = document.getElementById('newUserInput');
    const name = input.value.trim();
    if (!name) return;
    
    const validation = validateUserName(name);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }
    
    settings.users.push({ id: generateLocalId(), name });
    input.value = '';
    renderUsers(currentAdminState);
    save();
    invalidateLabelColorCache();
    emit('render-tickets');
}

/**
 * ラベルを追加（新規のみ）
 */
function addLabel() {
    const nameInput = document.getElementById('newLabelNameInput');
    const colorInput = document.getElementById('newLabelColorInput');
    const name = nameInput.value.trim();
    if (!name) return;
    
    const validation = validateLabelName(name);
    if (!validation.valid) {
        alert(validation.message);
        return;
    }
    
    // カラーピッカーの値を使用
    settings.labels.push({ id: generateLocalId(), name, color: colorInput.value });
    nameInput.value = '';
    colorInput.value = '#808080';
    renderLabels(currentAdminState);
    save();
    invalidateLabelColorCache();
    emit('render-tickets');
}

/**
 * 休日を保存（textarea変更時）
 */
function saveHolidays() {
    // 管理者のみ保存可能
    if (!currentAdminState) return;
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

        const token = getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

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

        const token = getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

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

    // オーバーレイクリックで閉じる
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                close();
            }
        });
    }

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

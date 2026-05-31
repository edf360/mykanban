/**
 * ラベル管理モジュール
 */

import { state, escapeHtml } from './state.js';

/**
 * ラベルを追加
 */
export function addLabel(text) {
    if (text.trim() && !state.currentLabels.includes(text.trim())) {
        state.currentLabels.push(text.trim());
        renderLabelTags();
    }
}

/**
 * ラベルを削除
 */
export function removeLabel(index) {
    state.currentLabels.splice(index, 1);
    renderLabelTags();
}

/**
 * ラベルタグを再描画
 */
function renderLabelTags() {
    const labelTagsEl = document.getElementById('labelTags');
    labelTagsEl.innerHTML = '';
    const labelColors = getLabelColorMap();
    state.currentLabels.forEach((label, i) => {
        const color = labelColors[label] || '#808080';
        const contrast = getContrastColor(color);
        labelTagsEl.innerHTML += `<span class="label-tag" style="background-color:${color};color:${contrast}">${escapeHtml(label)} <span class="remove-label" data-index="${i}">&times;</span></span>`;
    });
}

/**
 * ラベル名から色情報を取得するマップ（設定データから構築）
 */
function getLabelColorMap() {
    const map = {};
    if (typeof Settings !== 'undefined' && Settings.settings) {
        const labels = Settings.settings().labels || [];
        labels.forEach(l => {
            map[l.name] = l.color || '#808080';
        });
    }
    return map;
}

/**
 * 背景色に対するコントラスト文字色を計算
 */
function getContrastColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    const luminance = (r * 299 + g * 587 + b * 114) / 1000;
    return luminance > 128 ? '#000000' : '#ffffff';
}

/**
 * サジェスト表示関数
 */
export function showSuggestions(suggestEl, suggestions, filter, callback) {
    let filtered = suggestions.filter(s => !callback.exclude.includes(s));
    
    if (filter) {
        filtered = filtered.filter(s => s.toLowerCase().includes(filter.toLowerCase()));
    }
    
    filtered = filtered.slice(0, 10);
    
    if (filtered.length > 0) {
        suggestEl.innerHTML = filtered.map(s =>
            `<div class="suggest-item">${escapeHtml(s)}</div>`
        ).join('');
        suggestEl.classList.add('active');
        
        suggestEl.querySelectorAll('.suggest-item').forEach(item => {
            item.addEventListener('click', () => {
                callback.select(item.textContent);
            });
        });
    } else {
        suggestEl.classList.remove('active');
        suggestEl.innerHTML = '';
    }
}

/**
  * ラベル選択ドロップダウンを描画（設定から取得した一覧）
  */
export function renderLabelSelect() {
    const listEl = document.getElementById('labelList');
    const toggleBtn = document.getElementById('labelToggleBtn');
    if (!listEl || !toggleBtn) return;
    
    // ドロップダウンを閉じる
    listEl.classList.remove('active');
    
    listEl.innerHTML = '';
    
    const allLabels = state.labelSuggestions || [];
    const currentLabels = state.currentLabels || [];
    const labelColors = getLabelColorMap();
    
    allLabels.forEach(label => {
        const color = labelColors[label] || '#808080';
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        if (currentLabels.includes(label)) {
            item.classList.add('selected');
        }
        item.innerHTML = `<span class="label-color-dot" style="background-color:${color}"></span><span class="dropdown-checkmark">✓</span>${escapeHtml(label)}`;
        item.addEventListener('click', () => {
            toggleLabel(label);
            item.classList.toggle('selected');
        });
        listEl.appendChild(item);
    });
    
    // ボタンクリックでドロップダウン表示/非表示
    toggleBtn.onclick = (e) => {
        e.stopPropagation();
        listEl.classList.toggle('active');
    };
}

/**
 * ラベルをトグル
 */
function toggleLabel(label) {
    const idx = state.currentLabels.indexOf(label);
    if (idx >= 0) {
        state.currentLabels.splice(idx, 1);
    } else {
        state.currentLabels.push(label);
    }
}

/**
 * ドロップダウンの変更からラベル配列を更新（後方互換用）
 */
export function syncLabelsFromSelect() {
    // カスタムドロップダウンでは直接使用しないが、後方互換のため残す
}

/**
 * サジェストを隠すヘルパー関数（後方互換用）
 */
export function hideSuggestion(el) {
    el.classList.remove('active');
    el.innerHTML = '';
}

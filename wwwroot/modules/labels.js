/**
 * ラベル管理モジュール
 */

import { getCurrentLabels, getLabelSuggestions, escapeHtml, addLabelToState, removeLabelFromState } from './state.js';
import { getSettings } from './settings.js';

/**
 * ラベルを追加
 */
export function addLabel(text) {
    addLabelToState(text);
    renderLabelTags();
}

/**
 * ラベルを削除（ラベル名ベース）
 */
export function removeLabel(labelName) {
    removeLabelFromState(labelName);
    renderLabelTags();
}

/**
 * ラベルタグを再描画
 */
let removeLabelDelegateAttached = false;

function renderLabelTags() {
    // ドロップダウンで選択状態が確認できるため、ラベルタグボタンは非表示
    const labelTagsEl = document.getElementById('labelTags');
    if (labelTagsEl) {
        labelTagsEl.innerHTML = '';
    }
}

/**
 * ラベル名から色情報を取得するマップ（設定データから構築）
 */
function getLabelColorMap() {
    const map = {};
    const settings = getSettings();
    const labels = settings.labels || [];
    labels.forEach(l => {
        map[l.name] = l.color || '#808080';
    });
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
export function showSuggestions(suggestEl, suggestions, filter, excludeList, onSelect) {
    let filtered = suggestions.filter(s => !excludeList.includes(s));
    
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
                onSelect(item.textContent);
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
let toggleListenerAttached = false;

export function renderLabelSelect() {
    const listEl = document.getElementById('labelList');
    const toggleBtn = document.getElementById('labelToggleBtn');
    if (!listEl || !toggleBtn) return;
    
    // ドロップダウンを閉じる
    listEl.classList.remove('active');
    
    listEl.innerHTML = '';
    
    const allLabels = getLabelSuggestions();
    const currentLabels = getCurrentLabels();
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
            renderLabelTags();
        });
        listEl.appendChild(item);
    });
    
    // ボタンクリックでドロップダウン表示/非表示（重複防止）
    if (!toggleListenerAttached) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            listEl.classList.toggle('active');
        });
        toggleListenerAttached = true;
    }
}

/**
 * ラベルをトグル
 */
function toggleLabel(label) {
    const current = getCurrentLabels();
    const idx = current.indexOf(label);
    if (idx >= 0) {
        removeLabelFromState(label);
    } else {
        addLabelToState(label);
    }
}

/**
 * サジェストを隠すヘルパー関数（後方互換用）
 */
export function hideSuggestion(el) {
    el.classList.remove('active');
    el.innerHTML = '';
}

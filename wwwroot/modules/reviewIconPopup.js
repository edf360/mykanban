/**
 * レビューアイコン選択ポップアップコンポーネント
 * メイン画面・編集画面で共通使用
 */

import { showPopupOverlay, hidePopupOverlay } from './popupOverlay.js';

// AbortControllerによるイベントリスナー管理（メモリリーク防止）
let reviewIconPopupController = null;

/**
 * レビューアイコンの定義
 */
export const REVIEW_ICONS = [
    { state: 'none', icon: '📄' },
    { state: 'editing', icon: '📝' },
    { state: 'requested', icon: '📑' },
    { state: 'completed', icon: '✅' },
    { state: 'thumbsup', icon: '👍' },
    { state: 'happy', icon: '😄' },
    { state: 'sad', icon: '😥' },
    { state: 'shock', icon: '😱' }
];

/**
 * アイコン選択ポップアップを表示
 * @param {HTMLElement} anchorElement - ポップアップの基準となる要素
 * @param {string} currentState - 現在のレビュー状態
 * @param {Function} onSelect - 選択時のコールバック (state) => void
 */
export function showReviewIconPopup(anchorElement, currentState, onSelect) {
    // 既存ポップアップとリスナーを削除（AbortController使用）
    const existingPopup = document.querySelector('.review-icon-popup');
    if (existingPopup) existingPopup.remove();
    if (reviewIconPopupController) {
        reviewIconPopupController.abort();
    }
    reviewIconPopupController = new AbortController();
    const { signal } = reviewIconPopupController;
    
    // ポップアップ作成
    const popup = document.createElement('div');
    popup.className = 'review-icon-popup';
    
    REVIEW_ICONS.forEach(({ state, icon }) => {
        const item = document.createElement('span');
        item.className = 'review-icon-item';
        if (state === currentState) {
            item.classList.add('current');
        }
        item.textContent = icon;
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            reviewIconPopupController.abort();
            popup.remove();
            hidePopupOverlay();
            onSelect(state);
        });
        popup.appendChild(item);
    });
    
    // アンカー要素の位置に配置（画面内に収まるように調整）
    const rect = anchorElement.getBoundingClientRect();
    popup.style.position = 'fixed';
    
    // ポップアップのサイズを取得するために一時的に表示
    popup.style.visibility = 'hidden';
    document.body.appendChild(popup);
    const popupRect = popup.getBoundingClientRect();
    popup.style.visibility = '';
    
    // 横幅が画面外に出ないよう調整
    let left = rect.left;
    if (left + popupRect.width > window.innerWidth) {
        left = window.innerWidth - popupRect.width - 10;
    }
    if (left < 10) left = 10;
    
    // 高さが画面外に出ないよう調整
    let top = rect.bottom + 5;
    if (top + popupRect.height > window.innerHeight - 10) {
        top = rect.top - popupRect.height - 5;
    }
    if (top < 10) {
        top = 10;
    }
    
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    popup.style.zIndex = '10003';
    
    document.body.appendChild(popup);
    
    const onClickOutside = (e) => {
        if (!popup.contains(e.target)) {
            reviewIconPopupController.abort();
            popup.remove();
            hidePopupOverlay();
        }
    };
    
    document.addEventListener('click', onClickOutside, { signal });
    
    // オーバーレイを表示
    showPopupOverlay(() => {
        reviewIconPopupController.abort();
        popup.remove();
        hidePopupOverlay();
    });
}

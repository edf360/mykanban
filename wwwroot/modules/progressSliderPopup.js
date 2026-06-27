/**
 * 進捗率スライダーポップアップコンポーネント
 * メイン画面・編集画面で共通使用
 */

import { showPopupOverlay, hidePopupOverlay } from './popupOverlay.js';

/**
 * 進捗率スライダーポップアップを表示
 * @param {HTMLElement} anchorElement - ポップアップの基準となる要素
 * @param {number} currentValue - 現在の進捗率
 * @param {Function} onSave - 保存時のコールバック (newProgress) => Promise
 */
export function showProgressSlider(anchorElement, currentValue, onSave) {
    // 既存ポップアップを削除
    document.querySelectorAll('.progress-slider-popup').forEach(el => el.remove());
    
    // ポップアップ作成
    const popup = document.createElement('div');
    popup.className = 'progress-slider-popup';
    popup.innerHTML = `
        <input type="range" min="0" max="100" step="10" value="${currentValue}" class="progress-slider-input">
        <div class="progress-slider-label">${currentValue}%</div>
    `;
    
    // アンカー要素の位置に配置
    const rect = anchorElement.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.top + window.scrollY - 60}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.style.zIndex = '10003';
    
    document.body.appendChild(popup);
    
    const slider = popup.querySelector('.progress-slider-input');
    const label = popup.querySelector('.progress-slider-label');
    
    slider.addEventListener('input', () => {
        label.textContent = `${slider.value}%`;
    });
    
    const closePopup = async () => {
        const newValue = parseInt(slider.value);
        popup.remove();
        hidePopupOverlay();
        document.removeEventListener('click', onClickOutside);
        if (newValue !== currentValue && onSave) {
            await onSave(newValue);
        }
    };
    
    const onClickOutside = (e) => {
        if (!popup.contains(e.target)) {
            closePopup();
        }
    };
    
    setTimeout(() => document.addEventListener('click', onClickOutside), 0);
    
    // オーバーレイを表示
    showPopupOverlay(closePopup);
}

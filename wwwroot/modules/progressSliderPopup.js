/**
 * 進捗率スライダーポップアップコンポーネント
 * メイン画面・編集画面で共通使用
 */

import { showPopupOverlay, hidePopupOverlay } from './popupOverlay.js';
import { API_BASE } from './state.js';
import { getToken } from './auth.js';

/**
 * 進捗率スライダーポップアップを表示（従来のインターフェース）
 * @param {HTMLElement} anchorElement - ポップアップの基準となる要素
 * @param {number} currentValue - 現在の進捗率
 * @param {Function} onSave - 保存時のコールバック (newProgress, newHours?) => Promise
 * @param {string|null} ticketId - チケットID（実績時間表示用）
 * @param {string|null} date - 日付（実績時間表示用）
 * @param {number|null} childTaskIndex - 子タスクインデックス（実績時間表示用）
 * @param {number} currentHours - 現在の実績時間
 */
export function showProgressSlider(anchorElement, currentValue, onSave, ticketId = null, date = null, childTaskIndex = null, currentHours = 0) {
    const hasActual = ticketId !== null && date !== null;
    showProgressSliderWithActual(anchorElement, {
        currentProgress: currentValue,
        currentHours: hasActual ? currentHours : 0,
        ticketId: hasActual ? ticketId : null,
        date: hasActual ? date : null,
        childTaskIndex,
        onSave: async (progress, hours) => {
            if (!onSave) return;
            if (hasActual) {
                await onSave(progress, hours);
            } else {
                await onSave(progress);
            }
        }
    });
}

/**
 * 進捗率・実績時間設定ポップアップを表示（新しいインターフェース）
 * @param {HTMLElement} anchorElement - ポップアップの基準となる要素
 * @param {Object} options - オプション
 * @param {number} options.currentProgress - 現在の進捗率
 * @param {number} options.currentHours - 現在の実績時間
 * @param {string|null} options.ticketId - チケットID
 * @param {string|null} options.date - 日付 (yyyy-MM-dd)
 * @param {number|null} options.childTaskIndex - 子タスクインデックス (null=親)
 * @param {Function} options.onSave - 保存コールバック (progress, hours) => Promise
 * @param {Function} options.onClose - 閉じた時のコールバック
 */
export function showProgressSliderWithActual(anchorElement, options) {
    // 既存ポップアップを削除
    document.querySelectorAll('.progress-slider-popup').forEach(el => el.remove());

    const {
        currentProgress = 0,
        currentHours = 0,
        ticketId = null,
        date = null,
        childTaskIndex = null,
        onSave,
        onClose
    } = options;

    // ポップアップ作成
    const popup = document.createElement('div');
    popup.className = 'progress-slider-popup';

    const hasActual = ticketId !== null && date !== null;
    const dateLabel = hasActual ? `<div class="progress-slider-date">${date}</div>` : '';

    popup.innerHTML = `
        ${dateLabel}
        <input type="range" min="0" max="100" step="10" value="${currentProgress}" class="progress-slider-input">
        <div class="progress-slider-label">進捗率 ${currentProgress}%</div>
        ${hasActual ? `
            <div class="progress-slider-hours-row">
                <span>実績工数（時間）</span>
                <input type="number" class="progress-slider-hours-input" value="${currentHours}" min="0" max="24" step="0.25" placeholder="0">
            </div>
        ` : ''}
    `;

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
    
    // 高さが画面外に出ないよう調整（上に配置）
    let top = rect.top - 60;
    if (top < 10) {
        top = rect.bottom + 5;
    }
    if (top + popupRect.height > window.innerHeight - 10) {
        top = window.innerHeight - popupRect.height - 10;
    }
    
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
    popup.style.zIndex = '10003';

    document.body.appendChild(popup);

    const slider = popup.querySelector('.progress-slider-input');
    const label = popup.querySelector('.progress-slider-label');
    const hoursInput = popup.querySelector('.progress-slider-hours-input');

    slider.addEventListener('input', () => {
        label.textContent = `進捗率 ${slider.value}%`;
    });

    const closePopup = async () => {
        const newProgress = parseInt(slider.value);
        const newHours = hoursInput ? parseFloat(hoursInput.value) || 0 : 0;

        popup.remove();
        hidePopupOverlay();
        document.removeEventListener('click', onClickOutside);

        if (onSave) {
            await onSave(newProgress, newHours);
        }
        if (onClose) {
            onClose();
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

/**
 * 実績データ付きの進捗率ポップアップを表示（actualTable用）
 */
export function showActualProgressPopup(anchorElement, ticketId, date, childTaskIndex, currentProgress, currentHours, onSaved) {
    showProgressSliderWithActual(anchorElement, {
        currentProgress: currentProgress ?? 0,
        currentHours: currentHours ?? 0,
        ticketId,
        date,
        childTaskIndex,
        onSave: async (progress, hours) => {
            try {
                const body = { date, hours, progressRate: progress, childTaskIndex: childTaskIndex ?? undefined };
                const response = await fetch(`${API_BASE}/${encodeURIComponent(ticketId)}/actuals`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify(body)
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                if (onSaved) {
                    await onSaved(progress, hours);
                }
            } catch (error) {
                console.error('[ActualProgress] 保存失敗:', error);
                alert('保存に失敗しました: ' + error.message);
            }
        }
    });
}

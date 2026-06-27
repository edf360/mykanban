/**
 * レビューアイコン選択ポップアップコンポーネント
 * メイン画面・編集画面で共通使用
 */

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
    // 既存ポップアップを削除
    const existingPopup = document.querySelector('.review-icon-popup');
    if (existingPopup) existingPopup.remove();
    
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
            popup.remove();
            document.removeEventListener('click', onClickOutside);
            onSelect(state);
        });
        popup.appendChild(item);
    });
    
    // アンカー要素の位置に配置
    const rect = anchorElement.getBoundingClientRect();
    popup.style.position = 'fixed';
    popup.style.top = `${rect.bottom + 5}px`;
    popup.style.left = `${rect.left}px`;
    popup.style.zIndex = '1000';
    
    document.body.appendChild(popup);
    
    const onClickOutside = (e) => {
        if (!popup.contains(e.target)) {
            popup.remove();
            document.removeEventListener('click', onClickOutside);
        }
    };
    
    setTimeout(() => document.addEventListener('click', onClickOutside), 0);
}

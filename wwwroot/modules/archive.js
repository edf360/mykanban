/**
 * アーカイブ機能モジュール
 */

/**
 * アーカイブ機能を初期化
 */
export function initArchive() {
    const toggleBtn = document.getElementById('archiveToggleBtn');
    const archiveColumn = document.getElementById('archiveColumn');

    if (!toggleBtn || !archiveColumn) {
        console.warn('[Archive] Required elements not found');
        return;
    }

    // 重複初期化防止
    if (toggleBtn.dataset.initialized) {
        return;
    }
    toggleBtn.dataset.initialized = 'true';

    toggleBtn.addEventListener('click', () => {
        archiveColumn.classList.toggle('hidden');
    });
}

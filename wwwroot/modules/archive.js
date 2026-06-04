/**
 * アーカイブ機能モジュール
 */

/**
 * アーカイブ機能を初期化
 */
export function initArchive() {
    console.log('[Archive] initArchive called');
    const archiveToggleBottomBtn = document.getElementById('archiveToggleBtn');
    const archiveColumn = document.getElementById('archiveColumn');
    
    console.log('[Archive] archiveToggleBottomBtn:', archiveToggleBottomBtn, 'archiveColumn:', archiveColumn);
    
    if (archiveToggleBottomBtn && archiveColumn) {
        archiveToggleBottomBtn.addEventListener('click', () => {
            console.log('[Archive] toggle button clicked');
            if (archiveColumn.classList.contains('hidden')) {
                archiveColumn.classList.remove('hidden');
                archiveColumn.style.display = 'flex';
                console.log('[Archive] archive column shown');
            } else {
                archiveColumn.classList.add('hidden');
                archiveColumn.style.display = 'none';
                console.log('[Archive] archive column hidden');
            }
        });
    } else {
        console.warn('[Archive] Missing elements: archiveToggleBottomBtn:', !!archiveToggleBottomBtn, 'archiveColumn:', !!archiveColumn);
    }
}

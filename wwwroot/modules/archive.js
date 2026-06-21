/**
 * アーカイブ機能モジュール
 */

import { loadUserSettings, saveUserSettings } from './userSettings.js';

/**
 * アーカイブ表示状態を保存
 */
function saveArchiveVisibility(visible) {
    const settings = loadUserSettings();
    settings.archive = { visible };
    saveUserSettings(settings);
}

/**
 * アーカイブ機能を初期化
 */
export function initArchive() {
    const toggleBtn = document.getElementById('archiveToggleBtn');
    const archiveColumn = document.getElementById('archiveColumn');
    const closeBtn = document.getElementById('archiveCloseBtn');

    if (!toggleBtn || !archiveColumn) {
        console.warn('[Archive] Required elements not found');
        return;
    }

    // 重複初期化防止
    if (toggleBtn.dataset.initialized) {
        return;
    }
    toggleBtn.dataset.initialized = 'true';

    // 保存された設定を復元
    const settings = loadUserSettings();
    if (settings.archive && settings.archive.visible) {
        archiveColumn.classList.remove('hidden');
        toggleBtn.classList.add('active');
    } else {
        archiveColumn.classList.add('hidden');
        toggleBtn.classList.remove('active');
    }

    toggleBtn.addEventListener('click', () => {
        const isVisible = !archiveColumn.classList.contains('hidden');
        archiveColumn.classList.toggle('hidden');
        toggleBtn.classList.toggle('active');
        saveArchiveVisibility(!isVisible);
    });

    // ×ボタンでarchiveを隠す（toggleオフと同じ動作）
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            archiveColumn.classList.add('hidden');
            saveArchiveVisibility(false);
        });
    }
}

/**
 * ストア統合エクスポート
 */

// イベントバス
export { on, off, emit } from './eventStore.js';

// ストア
import useTicketStore from './ticketStore.js';
import useFilterStore from './filterStore.js';
import useUiStore from './uiStore.js';
import useModalStore from './modalStore.js';
import useSuggestionStore from './suggestionStore.js';

export {
    useTicketStore,
    useFilterStore,
    useUiStore,
    useModalStore,
    useSuggestionStore,
};

// 定数
export { API_BASE } from '../utils/constants.js';

// ユーティリティ
export { escapeHtml } from '../utils/escapeHtml.js';
export { formatDateWithDay } from '../utils/formatDate.js';

// 設定データアクセス（settings.js経由）
export function getSettings() {
    return window.Settings?.settings?.() ?? { users: [], labels: [], holidays: [], memos: {} };
}

// ラベルカラーキャッシュ無効化用関数
export let labelColorCacheInvalidated = false;
export function invalidateLabelColorCache() {
    labelColorCacheInvalidated = true;
}

/**
 * ラベルカラーキャッシュを無効化して再描画をリクエスト
 */
export function requestRenderAfterSettingsChange() {
    invalidateLabelColorCache();
    emit('render-tickets');
}

// グラフパネル閉じるためのコールバック
let closeGraphPanelCallback = null;

export function setCloseGraphPanelCallback(fn) {
    closeGraphPanelCallback = fn;
}

export function closeGraphPanel() {
    if (closeGraphPanelCallback) {
        closeGraphPanelCallback();
    }
}

/**
 * ユーザー別設定の保存・読み込み層
 * localStorage にユーザー名ごとに設定を保存する
 */

import { getUsername } from './auth.js';

const SETTINGS_KEY_PREFIX = 'kanban_user_settings_';

/**
 * ユーザー設定のストレージキーを生成
 */
function getKey() {
  const username = getUsername();
  if (!username) return null;
  return `${SETTINGS_KEY_PREFIX}${encodeURIComponent(username)}`;
}

/**
 * デフォルト設定を返す
 */
export function getDefaultSettings() {
  return {
    filter: { visible: true, assignee: '', keyword: '', label: '', mainOnly: false },
    graph: { visible: false, label: '', viewType: 'matrix', excludedTicketIds: [], height: null, assignee: '' },
    archive: { visible: false },
    memo: { visible: false },
    childTasks: { hidden: [] },
    collapsedTickets: [],
    actual: { visible: false, assignee: '', columns: ['todo', 'doing', 'done'], month: '' }
  };
}

/**
 * ユーザー設定を読み込む（localStorageから）
 * 存在しない場合はデフォルト設定を返す
 */
export function loadUserSettings() {
  const key = getKey();
  if (!key) return getDefaultSettings();
  try {
    const data = localStorage.getItem(key);
    if (!data) return getDefaultSettings();
    const parsed = JSON.parse(data);
    // デフォルトとマージ（欠落したフィールドを補完）
    const defaults = getDefaultSettings();
    return {
      filter: { ...defaults.filter, ...(parsed.filter || {}) },
      graph: { ...defaults.graph, ...(parsed.graph || {}) },
      archive: { ...defaults.archive, ...(parsed.archive || {}) },
      memo: { ...defaults.memo, ...(parsed.memo || {}) },
      childTasks: { ...defaults.childTasks, ...(parsed.childTasks || {}) },
      collapsedTickets: parsed.collapsedTickets || defaults.collapsedTickets,
      actual: { ...defaults.actual, ...(parsed.actual || {}) }
    };
  } catch {
    return getDefaultSettings();
  }
}

/**
 * ユーザー設定を保存する（localStorageに）
 */
export function saveUserSettings(settings) {
  const key = getKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save user settings:', e);
  }
}

/**
 * ユーザー設定をクリアする
 */
export function clearUserSettings() {
  const key = getKey();
  if (!key) return;
  localStorage.removeItem(key);
}

/**
 * ユーザー別設定の保存・読み込み層
 * localStorage にユーザー名ごとに設定を保存する
 *
 * 改善点:
 * - スキーマバージョン管理
 * - 集中型パッチ更新API（各モジュールは部分更新のみを担当）
 * - debounceによるバッチ保存（localStorage I/O削減）
 * - 破損したデータの自動回復
 */

import { getUsername } from './auth.js';

const SETTINGS_KEY_PREFIX = 'kanban_user_settings_';
const SCHEMA_VERSION = 1;

// debounceタイマー
let saveTimer = null;
let pendingPatch = null;

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
    _version: SCHEMA_VERSION,
    filter: { visible: true, assignee: '', keyword: '', label: '', mainOnly: false },
    graph: { visible: false, label: '', viewType: 'matrix', excludedTicketIds: [], height: null, assignees: [] },
    archive: { visible: false },
    memo: { visible: false },
    childTasks: { hidden: [] },
    collapsedTickets: [],
    actual: { visible: false, assignee: '', columns: ['todo', 'doing', 'done'], month: '' }
  };
}

/**
 * 設定オブジェクトに欠落しているフィールドをデフォルトで補完する
 * 再帰的にネストされたオブジェクトも処理する
 */
function fillDefaults(settings, defaults) {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (settings[key] !== undefined) {
      result[key] = settings[key];
    }
    // ネストされたオブジェクトの場合、再帰的に補完
    if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
      if (typeof settings[key] === 'object' && settings[key] !== null && !Array.isArray(settings[key])) {
        result[key] = fillDefaults(settings[key], defaults[key]);
      }
    }
  }
  return result;
}

/**
 * ユーザー設定を読み込む（localStorageから）
 * 存在しない場合はデフォルト設定を返す
 * スキーマバージョンが古い場合はマイグレーションを試みる
 */
export function loadUserSettings() {
  const key = getKey();
  if (!key) return getDefaultSettings();
  try {
    const data = localStorage.getItem(key);
    if (!data) return getDefaultSettings();
    const parsed = JSON.parse(data);

    // バージョンチェック（現時点ではv1のみ）
    if (parsed._version && parsed._version > SCHEMA_VERSION) {
      console.warn('[userSettings] Settings version is newer than expected, using defaults');
      return getDefaultSettings();
    }

    // デフォルトとマージ（欠落したフィールドを補完）
    const defaults = getDefaultSettings();
    return fillDefaults(parsed, defaults);
  } catch {
    console.warn('[userSettings] Failed to parse settings, using defaults');
    return getDefaultSettings();
  }
}

/**
 * ユーザー設定を保存する（localStorageに）
 * 直接保存用（即時反映が必要な場合）
 */
function flushSave(settings) {
  const key = getKey();
  if (!key) return;
  try {
    // バージョン番号を付与
    settings._version = SCHEMA_VERSION;
    localStorage.setItem(key, JSON.stringify(settings));
  } catch (e) {
    console.error('[userSettings] Failed to save user settings:', e);
  }
}

/**
 * ユーザー設定を保存する（debounce付き）
 * 短い間に複数の変更があった場合は最後にまとめて保存する
 */
function debouncedSave(partial) {
  // パッチをマージ
  if (pendingPatch) {
    mergePatch(pendingPatch, partial);
  } else {
    pendingPatch = { ...partial };
  }

  // 既存タイマーがあればクリア
  if (saveTimer) {
    clearTimeout(saveTimer);
  }

  // 100ms後に保存を実行
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const patch = pendingPatch;
    pendingPatch = null;
    if (patch) {
      applyAndSave(patch);
    }
  }, 100);
}

/**
 * パッチをマージする（浅いマージ）
 * target に source の値を反映
 */
function mergePatch(target, source) {
  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = target[key];
    if (typeof srcVal === 'object' && srcVal !== null && !Array.isArray(srcVal)
        && typeof tgtVal === 'object' && tgtVal !== null && !Array.isArray(tgtVal)) {
      // ネストされたオブジェクトは再帰的にマージ
      mergePatch(tgtVal, srcVal);
    } else {
      target[key] = srcVal;
    }
  }
}

/**
 * パッチを適用して保存する
 */
function applyAndSave(partial) {
  const settings = loadUserSettings();
  mergePatch(settings, partial);
  flushSave(settings);
}

/**
 * 設定の一部を更新する（debounce付き）
 * 例: updateUserSettings({ filter: { assignee: 'tanaka' } })
 * → settings.filter.assignee が 'tanaka' に更新される
 */
export function updateUserSettings(partial) {
  if (!partial || typeof partial !== 'object') return;
  debouncedSave(partial);
}

/**
 * 設定の一部を即時更新する（debounceなし）
 * ページ離脱時などに使用
 */
export function updateUserSettingsSync(partial) {
  if (!partial || typeof partial !== 'object') return;
  applyAndSave(partial);
}

/**
 * ページ離脱時に保留中の保存をフラッシュする
 */
export function flushPendingSettings() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingPatch) {
    applyAndSave(pendingPatch);
    pendingPatch = null;
  }
}

/**
 * 折り畳みチケットのリストを更新
 */
export function updateCollapsedTickets(updater) {
  const settings = loadUserSettings();
  if (!Array.isArray(settings.collapsedTickets)) {
    settings.collapsedTickets = [];
  }
  const result = updater(settings.collapsedTickets);
  updateUserSettingsSync({ collapsedTickets: result });
}

/**
 * 折り畳みチケットの確認
 */
export function isTicketCollapsed(ticketId) {
  const settings = loadUserSettings();
  return Array.isArray(settings.collapsedTickets) && settings.collapsedTickets.includes(ticketId);
}

/**
 * 子タスク非表示リストを更新
 */
export function updateHiddenChildTasks(updater) {
  const settings = loadUserSettings();
  if (!settings.childTasks || !Array.isArray(settings.childTasks.hidden)) {
    settings.childTasks = { hidden: [] };
  }
  const result = updater(settings.childTasks.hidden);
  updateUserSettingsSync({ childTasks: { hidden: result } });
}

/**
 * フィルター状態を更新
 */
export function updateFilterState(partial) {
  updateUserSettings({ filter: partial });
}

/**
 * グラフ設定を更新
 */
export function updateGraphSettings(partial) {
  updateUserSettings({ graph: partial });
}

/**
 * グラフ設定を即時更新
 */
export function updateGraphSettingsSync(partial) {
  updateUserSettingsSync({ graph: partial });
}

/**
 * アーカイブ表示状態を更新
 */
export function updateArchiveVisibility(visible) {
  updateUserSettings({ archive: { visible } });
}

/**
 * メモ表示状態を更新
 */
export function updateMemoVisibility(visible) {
  updateUserSettings({ memo: { visible } });
}

/**
 * 実績表設定を更新
 */
export function updateActualSettings(partial) {
  updateUserSettings({ actual: partial });
}

/**
 * 実績表設定を即時更新
 */
export function updateActualSettingsSync(partial) {
  updateUserSettingsSync({ actual: partial });
}

/**
 * ユーザー設定をクリアする
 */
export function clearUserSettings() {
  const key = getKey();
  if (!key) return;
  localStorage.removeItem(key);
}

/**
 * 旧APIの後方互換ラッパー（削除予定）
 */
export function saveUserSettings(settings) {
  flushSave(settings);
}

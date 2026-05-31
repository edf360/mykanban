/**
 * ロガーモジュール
 * リングバッファによるクライアント側ログ管理
 */

const MAX_LOG_ENTRIES = 500;

/**
 * デバイス情報を取得
 */
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.includes('Firefox/')) browser = 'Firefox';
    else if (ua.includes('Edg/')) browser = 'Edge';
    else if (ua.includes('Chrome/')) browser = 'Chrome';
    else if (ua.includes('Safari/')) browser = 'Safari';

    let os = 'Unknown';
    if (ua.includes('Windows NT 10')) os = 'Windows 10/11';
    else if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS X')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return {
        browser,
        os,
        userAgent: ua,
        language: navigator.language,
        screenResolution: `${screen.width}x${screen.height}`,
        timestamp: new Date().toISOString()
    };
}

/**
 * ログエントリを作成
 */
function createEntry(level, message, data = null) {
    return {
        id: Date.now() + Math.random(),
        timestamp: new Date().toISOString(),
        level,
        message,
        data,
        deviceInfo: getDeviceInfo()
    };
}

/**
 * リングバッファ（最新500件保持）
 */
const logBuffer = [];

/**
 * UI更新イベントのリスナーリスト
 */
const uiListeners = [];

/**
 * UI更新イベントを発火
 */
function notifyUI(entry) {
    for (const listener of uiListeners) {
        try {
            listener(entry);
        } catch (e) {
            // リスナーのエラーはログに記録のみ
        }
    }
}

/**
 * UI更新リスナーを登録
 */
export function onUIUpdate(listener) {
    if (typeof listener === 'function') {
        uiListeners.push(listener);
    }
}

/**
 * ログを追加（リングバッファ管理）
 */
function addEntry(entry) {
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_ENTRIES) {
        logBuffer.shift();
    }
    notifyUI(entry);
}

/**
 * 一般ログ記録
 */
export function log(level, message, data = null) {
    const entry = createEntry(level, message, data);
    addEntry(entry);
}

/**
 * レベル別ショートカット
 */
export function logDebug(message, data = null) {
    log('DEBUG', message, data);
}

export function logInfo(message, data = null) {
    log('INFO', message, data);
}

export function logWarn(message, data = null) {
    log('WARN', message, data);
}

export function logError(message, data = null) {
    log('ERROR', message, data);
}

/**
 * APIリクエストログ
 */
export function logApiRequest(method, url) {
    log('INFO', `[API Request] ${method} ${url}`);
}

/**
 * APIレスポンスログ
 */
export function logApiResponse(method, url, status) {
    log('INFO', `[API Response] ${method} ${url} -> ${status}`);
}

/**
 * APIエラーログ
 */
export function logApiError(method, url, error) {
    log('ERROR', `[API Error] ${method} ${url} -> ${error?.message || String(error)}`, { error });
}

/**
 * フィルタレベル以上のログを取得
 */
function getFilteredEntries(filterLevel = 'DEBUG') {
    const levelOrder = { 'DEBUG': 0, 'INFO': 1, 'WARN': 2, 'ERROR': 3 };
    const minLevel = levelOrder[filterLevel] ?? 0;
    return logBuffer.filter(entry => (levelOrder[entry.level] ?? 0) >= minLevel);
}

/**
 * ログをクリップボードにコピー
 */
export function copyToClipboard(filterLevel = 'DEBUG') {
    const entries = getFilteredEntries(filterLevel);
    const text = formatEntriesAsText(entries);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(() => {
            fallbackCopy(text);
        });
    } else {
        fallbackCopy(text);
    }
}

/**
 * フォールバックコピー
 */
function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } catch (e) {
        // コピー失敗
    }
    document.body.removeChild(textarea);
}

/**
 * ログをテキスト形式でエクスポート
 */
export function exportAsText(filterLevel = 'DEBUG') {
    const entries = getFilteredEntries(filterLevel);
    return formatEntriesAsText(entries);
}

/**
 * エントリ配列をテキスト形式に変換
 */
function formatEntriesAsText(entries) {
    const deviceInfo = getDeviceInfo();
    let text = `=== カンバンボード ログエクスポート ===\n`;
    text += `エクスポート時刻: ${new Date().toISOString()}\n`;
    text += `ブラウザ: ${deviceInfo.browser}\n`;
    text += `OS: ${deviceInfo.os}\n`;
    text += `解像度: ${deviceInfo.screenResolution}\n`;
    text += `言語: ${deviceInfo.language}\n`;
    text += `ログ件数: ${entries.length}\n`;
    text += `===================================\n\n`;

    for (const entry of entries) {
        const time = new Date(entry.timestamp).toLocaleString('ja-JP');
        text += `[${time}] [${entry.level}] ${entry.message}`;
        if (entry.data) {
            try {
                text += ` | ${JSON.stringify(entry.data)}`;
            } catch {
                text += ` | ${String(entry.data)}`;
            }
        }
        text += '\n';
    }

    return text;
}

/**
 * 現在のログ件数を取得
 */
export function getLogCount(filterLevel = 'DEBUG') {
    return getFilteredEntries(filterLevel).length;
}

/**
 * 全ログをクリア
 */
export function clearLogs() {
    logBuffer.length = 0;
}

/**
 * 生バッファ参照を返す（UI描画用）
 */
export function getLogBuffer() {
    return logBuffer;
}

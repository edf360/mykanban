/**
 * イベントバス
 * 全モジュールから共有されるイベント通知機構
 */

const eventListeners = {};

export function on(event, callback) {
    if (!eventListeners[event]) {
        eventListeners[event] = new Set();
    }
    // 重複登録防止（Set使用）
    eventListeners[event].add(callback);

    // unsubscribe関数を返す
    return () => off(event, callback);
}

export function off(event, callback) {
    if (eventListeners[event]) {
        eventListeners[event].delete(callback);
    }
}

export function emit(event, data) {
    if (eventListeners[event]) {
        // コピーして反復（実行中の削除に安全）
        [...eventListeners[event]].forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`Event listener error for ${event}:`, e);
            }
        });
    }
}

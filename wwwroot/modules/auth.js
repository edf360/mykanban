/**
 * 認証管理モジュール
 * トークンの保存・取得・管理者チェック
 */

const AUTH_STORAGE_KEY = 'kanban_auth';
let authCache = null;

/**
 * 認証情報を取得（キャッシュ優先）
 */
export function getAuth() {
    if (authCache) {
        return authCache;
    }
    try {
        const data = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (!data) {
            return null;
        }
        const auth = JSON.parse(data);
        if (typeof auth.token !== 'string' || typeof auth.isAdmin !== 'boolean') {
            return null;
        }
        authCache = auth;
        return auth;
    } catch (error) {
        console.warn('Invalid auth data', error);
        return null;
    }
}

/**
 * 認証情報を保存（キャッシュ更新）
 */
export function setAuth(token, isAdmin, username) {
    authCache = { token, isAdmin, username };
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authCache));
}

/**
 * 認証情報を削除（キャッシュクリア）
 */
export function clearAuth() {
    authCache = null;
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

/**
 * トークンを取得
 */
export function getToken() {
    const auth = getAuth();
    return auth?.token || null;
}

/**
 * 管理者かどうか
 */
export function isAdmin() {
    const auth = getAuth();
    return auth?.isAdmin === true;
}

/**
 * ユーザー名を取得
 */
export function getUsername() {
    const auth = getAuth();
    return auth?.username || null;
}

/**
 * 管理者チェック。一般ユーザーの場合は false を返す
 */
export function requireAdmin() {
    if (!isAdmin()) {
        return false;
    }
    return true;
}

/**
 * ログインAPIを呼び出す
 */
export async function login(username, password) {
    let response;
    try {
        response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
    } catch {
        throw new Error('サーバーに接続できません');
    }

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'ログインに失敗しました');
    }

    const data = await response.json();
    setAuth(data.token, data.isAdmin, data.username);
    return data;
}

/**
 * ログアウトAPIを呼び出す
 */
export async function logout() {
    const token = getToken();
    try {
        if (token) {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
    } catch {
        // ログアウトAPIの失敗は無視
    } finally {
        clearAuth();
    }
}

/**
 * 要素の表示/非表示を切り替え
 */
function setVisible(el, visible) {
    if (!el) {
        return;
    }
    el.classList.toggle('hidden', !visible);
}

/**
 * ログイン画面を表示する
 */
export function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const appContent = document.getElementById('appContent');
    const bottomButtons = document.querySelector('.bottom-left-buttons');
    const filterArea = document.getElementById('filterArea');

    setVisible(loginScreen, true);
    setVisible(appContent, false);
    setVisible(bottomButtons, false);
    setVisible(filterArea, false);
}

/**
 * アプリ画面を表示する（ログイン成功後）
 */
export function showAppScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const appContent = document.getElementById('appContent');
    const bottomButtons = document.querySelector('.bottom-left-buttons');
    const filterArea = document.getElementById('filterArea');

    setVisible(loginScreen, false);
    setVisible(appContent, true);
    setVisible(bottomButtons, true);
    setVisible(filterArea, true);
}

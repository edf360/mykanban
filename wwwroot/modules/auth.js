/**
 * 認証管理モジュール
 * トークンの保存・取得・管理者チェック
 */

const AUTH_STORAGE_KEY = 'kanban_auth';

/**
 * 認証情報を取得
 */
export function getAuth() {
    try {
        const data = sessionStorage.getItem(AUTH_STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    } catch {
        return null;
    }
}

/**
 * 認証情報を保存
 */
export function setAuth(token, isAdmin, username) {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ token, isAdmin, username }));
}

/**
 * 認証情報を削除（ログアウト）
 */
export function clearAuth() {
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
 * 管理者チェック。一般ユーザーの場合はエラーダイアログを表示
 */
export function requireAdmin() {
    if (!isAdmin()) {
        alert('この機能は管理者のみ利用できます。');
        return false;
    }
    return true;
}

/**
 * ログインAPIを呼び出す
 */
export async function login(username, password) {
    const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });

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
    if (token) {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch {
            // ログアウトAPIの失敗は無視
        }
    }
    clearAuth();
}

/**
 * ログイン画面を表示する
 */
export function showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const appContent = document.getElementById('appContent');
    const bottomButtons = document.querySelector('.bottom-left-buttons');
    const filterArea = document.getElementById('filterArea');

    if (loginScreen) loginScreen.style.display = 'flex';
    if (appContent) appContent.style.display = 'none';
    if (bottomButtons) bottomButtons.style.display = 'none';
    if (filterArea) filterArea.style.display = 'none';
}

/**
 * アプリ画面を表示する（ログイン成功后）
 */
export function showAppScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const appContent = document.getElementById('appContent');
    const bottomButtons = document.querySelector('.bottom-left-buttons');
    const filterArea = document.getElementById('filterArea');

    if (loginScreen) loginScreen.style.display = 'none';
    if (appContent) appContent.style.display = '';
    if (bottomButtons) bottomButtons.style.display = '';
    if (filterArea) filterArea.style.display = '';
}

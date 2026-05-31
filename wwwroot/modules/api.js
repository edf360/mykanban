/**
 * API通信層
 * HTTPリクエストの共通処理とデータ取得
 */

import { API_BASE, state, initTicketData } from './state.js';
import { getToken } from './auth.js';
import { logApiRequest, logApiResponse, logApiError } from './logger.js';

/**
 * 共通APIリクエスト関数
 */
export async function apiRequest(method, url, body) {
    // リクエストログ
    logApiRequest(method, url);

    const options = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };

    // 認証トークンを付与
    const token = getToken();
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        // 401: 認証失敗 → ログイン画面に戻る
        if (response.status === 401) {
            console.warn('[api] Unauthorized - redirecting to login');
            logApiError(method, url, new Error('Unauthorized'));
            window.location.href = '/';
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'API request failed';
            try {
                const error = JSON.parse(errorText);
                errorMessage = error.error || errorMessage;
            } catch {
                errorMessage = 'API request failed: ' + errorText;
            }
            logApiError(method, url, new Error(errorMessage));
            throw new Error(errorMessage);
        }

        // レスポンスログ
        logApiResponse(method, url, response.status);

        if (response.status === 204) {
            return;
        }
        return response.json();
    } catch (error) {
        // fetch 自体が失敗した場合（ネットワークエラー等）
        if (!error.message.includes('Unauthorized') && !error.message.includes('API request failed')) {
            logApiError(method, url, error);
        }
        throw error;
    }
}

/**
 * チケット一覧をサーバーから取得して状態に反映
 */
export async function loadTickets() {
    try {
        const tickets = await apiRequest('GET', API_BASE, null);
        initTicketData(tickets);
    } catch (error) {
        console.error('Failed to load tickets:', error);
        throw error;
    }
}

/**
 * サジェストデータをロード
 */
export async function loadSuggestions() {
    try {
        const labelData = await apiRequest('GET', `${API_BASE}/labels/suggest`, null);
        state.labelSuggestions = Array.isArray(labelData) ? labelData.map(l => l.name || String(l)) : [];
        const assigneeData = await apiRequest('GET', `${API_BASE}/assignees/suggest`, null);
        console.log('[loadSuggestions] t=', Date.now(), 'data:', assigneeData);
        // 担当者データもラベル側と同様に文字列に変換（オブジェクト配列の場合の互換性）
        state.assigneeSuggestions = Array.isArray(assigneeData)
            ? assigneeData.map(a => a.name || String(a))
            : [];
        console.log('[loadSuggestions] SET state.assigneeSuggestions =', state.assigneeSuggestions);
    } catch (error) {
        console.error('Failed to load suggestions:', error);
        throw error;
    }
}

/**
 * チケット履歴を取得
 */
export async function loadHistory(ticketId) {
    try {
        return await apiRequest('GET', `${API_BASE}/${ticketId}/history`, null);
    } catch (error) {
        console.error('Failed to load history:', error);
        throw error;
    }
}

/**
 * API通信層
 * HTTPリクエストの共通処理とデータ取得
 */

import { API_BASE, initTickets, setLabelSuggestions, setAssigneeSuggestions } from './state.js';
import { getToken } from './auth.js';
import { logApiRequest, logApiResponse, logApiError } from './logger.js';

/**
 * 認証失敗専用例外
 * 呼び出し側でフィルタして不要なエラーログを抑制する
 */
export class UnauthorizedError extends Error {
    constructor() {
        super('Unauthorized');
        this.name = 'UnauthorizedError';
    }
}

/**
 * 安全にエラーメッセージ文字列を取得
 */
function getErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}

/**
 * レスポンスボディを Content-Type に応じてパース
 */
async function parseResponseBody(response) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return response.json();
    }
    return response.text();
}

/**
 * 共通APIリクエスト関数
 * @param {string} method - HTTPメソッド（GET, POST, PUT, PATCH, DELETE）
 * @param {string} url - リクエストURL
 * @param {object} [body] - リクエストボディ（オプション）
 * @returns {Promise<object>} レスポンスデータ
 */
export async function apiRequest(method, url, body) {
    // リクエストログ
    logApiRequest(method, url);

    // GET 以外にのみ Content-Type を付与
    const headers = {};
    if (body !== undefined && body !== null) {
        headers['Content-Type'] = 'application/json';
    }

    const options = {
        method,
        headers,
    };

    // 認証トークンを付与
    const token = getToken();
    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body !== undefined && body !== null) {
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(url, options);

        // 401: 認証失敗 → ログイン画面に戻る（replaceで履歴に残らないように）
        if (response.status === 401) {
            console.warn('[api] Unauthorized - redirecting to login');
            logApiError(method, url, new UnauthorizedError());
            window.location.replace('/');
            throw new UnauthorizedError();
        }

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = 'API request failed';
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.error || errorMessage;
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
        return parseResponseBody(response);
    } catch (error) {
        // fetch 自体が失敗した場合（ネットワークエラー等）
        // UnauthorizedError は既にログ出力済みなのでスキップ
        if (error instanceof UnauthorizedError) {
            throw error;
        }
        const message = getErrorMessage(error);
        if (!message.includes('Unauthorized') && !message.includes('API request failed')) {
            logApiError(method, url, error);
        }
        throw error;
    }
}

/**
 * チケット一覧をサーバーから取得して状態に反映
 * @returns {Promise<void>}
 */
export async function loadTickets() {
    try {
        const tickets = await apiRequest('GET', API_BASE, null);
        initTickets(tickets);
    } catch (error) {
        // UnauthorizedError は apiRequest 側でログ出力済み
        if (!(error instanceof UnauthorizedError)) {
            console.error('Failed to load tickets:', error);
        }
        throw error;
    }
}

/**
 * 担当者・ラベルのサジェストデータをロード
 * @returns {Promise<void>}
 */
export async function loadSuggestions() {
    try {
        // ラベルと担当者を並列取得
        const [labelData, assigneeData] = await Promise.all([
            apiRequest('GET', `${API_BASE}/labels/suggest`, null),
            apiRequest('GET', `${API_BASE}/assignees/suggest`, null)
        ]);
        // 安全に文字列配列に変換（文字列はそのまま、オブジェクトは name プロパティを使用）
        const labels = Array.isArray(labelData)
            ? labelData.map(item => typeof item === 'string' ? item : (item.name || ''))
                       .filter(Boolean)
            : [];
        setLabelSuggestions(labels);

        const assignees = Array.isArray(assigneeData)
            ? assigneeData.map(item => typeof item === 'string' ? item : (item.name || ''))
                          .filter(Boolean)
            : [];
        setAssigneeSuggestions(assignees);
        console.log('[loadSuggestions] SET assigneeSuggestions =', assignees);
    } catch (error) {
        // UnauthorizedError は apiRequest 側でログ出力済み
        if (!(error instanceof UnauthorizedError)) {
            console.error('Failed to load suggestions:', error);
        }
        throw error;
    }
}

/**
 * 簡易APIクライアントオブジェクト
 * GET/POST/PUT/PATCH/DELETEメソッドを提供
 */
export const api = {
    get: (url) => apiRequest('GET', url, null),
    post: (url, body) => apiRequest('POST', url, body),
    put: (url, body) => apiRequest('PUT', url, body),
    patch: (url, body) => apiRequest('PATCH', url, body),
    delete: (url) => apiRequest('DELETE', url, null),
};

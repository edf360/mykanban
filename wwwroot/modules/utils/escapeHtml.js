/**
 * HTMLエスケープ（null/undefined 安全、DOM生成なしの文字列置換）
 */
export function escapeHtml(text) {
    if (text == null) return '';
    let s = String(text);
    s = s.replace(/&/g, '\u0026amp;');
    s = s.replace(/</g, '\u0026lt;');
    s = s.replace(/>/g, '\u0026gt;');
    s = s.replace(/"/g, '\u0026quot;');
    s = s.replace(/'/g, '\u0026#39;');
    return s;
}

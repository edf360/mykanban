/**
 * 日付フォーマットユーティリティ
 */

/**
 * 日付を「月日(曜日)」形式に変換（null安全、toLocaleDateString使用）
 */
export function formatDateWithDay(date) {
    if (!date) return '';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric',
            weekday: 'short'
        });
    } catch {
        return '';
    }
}

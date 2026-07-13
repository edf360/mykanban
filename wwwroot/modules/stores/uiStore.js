import { create } from './zustand.mjs';
import { emit } from './eventStore.js';
import { loadUserSettings, updateHiddenChildTasks } from '../userSettings.js';

const useUiStore = create((set, get) => ({
    // 状態
    graphPanelOpen: false,
    ticketLocked: false,
    ticketEmergency: false,
    hiddenChildTasks: new Set(),
    graphAssignees: [],

    // グラフパネル開閉状態を取得
    isGraphPanelOpen: () => {
        return get().graphPanelOpen;
    },

    // グラフパネル開閉状態を設定
    setGraphPanelOpen: (open) => {
        set({ graphPanelOpen: open });
        emit('ui-changed', get());
    },

    // チケットロック状態を取得
    isTicketLocked: () => {
        return get().ticketLocked;
    },

    // チケットロック状態を設定
    setTicketLocked: (locked) => {
        set({ ticketLocked: locked });
        emit('ui-changed', get());
    },

    // 緊急フラグを取得
    isTicketEmergency: () => {
        return get().ticketEmergency;
    },

    // 緊急フラグを設定
    setTicketEmergency: (emergency) => {
        set({ ticketEmergency: emergency });
        emit('ui-changed', get());
    },

    // 子タスクの表示/非表示状態を取得
    isChildTaskHidden: (ticketId, childId) => {
        const key = `${ticketId}:${childId}`;
        return get().hiddenChildTasks.has(key);
    },

    // 子タスクの表示/非表示状態を設定
    setChildTaskHidden: (ticketId, childId, hidden) => {
        const key = `${ticketId}:${childId}`;
        set((state) => {
            const newHidden = new Set(state.hiddenChildTasks);
            if (hidden) {
                newHidden.add(key);
            } else {
                newHidden.delete(key);
            }
            // 永続化（新API使用）
            updateHiddenChildTasks(list => Array.from(newHidden));
            return { hiddenChildTasks: newHidden };
        });
    },

    // 子タスク非表示状態を復元
    restoreHiddenChildTasks: () => {
        const settings = loadUserSettings();
        if (settings.childTasks && settings.childTasks.hidden && Array.isArray(settings.childTasks.hidden)) {
            set({ hiddenChildTasks: new Set(settings.childTasks.hidden) });
        }
    },

    // グラフ担当者リストを設定
    setGraphAssignees: (assignees) => {
        set({ graphAssignees: assignees });
        emit('ui-changed', get());
    },

    // グラフ担当者リストを取得
    getGraphAssignees: () => {
        return get().graphAssignees;
    },

    // グラフパネルを閉じる
    closeGraphPanel: () => {
        const state = get();
        if (state.graphPanelOpen) {
            set({ graphPanelOpen: false });
            emit('ui-changed', { ...state, graphPanelOpen: false });
        }
    },
}));

export default useUiStore;

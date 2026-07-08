import { create } from './zustand.mjs';
import { emit } from './eventStore.js';

const useSuggestionStore = create((set, get) => ({
    // 状態
    labels: [],
    assignees: [],

    // アクション
    setLabelSuggestions: (labels) => {
        set({ labels });
        emit('suggestions-changed', { type: 'labels' });
    },

    setAssigneeSuggestions: (assignees) => {
        set({ assignees });
        emit('suggestions-changed', { type: 'assignees' });
    },

    getLabelSuggestions: () => {
        return [...get().labels];
    },

    getAssigneeSuggestions: () => {
        return [...get().assignees];
    },
}));

export default useSuggestionStore;

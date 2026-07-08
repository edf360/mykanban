import { create } from './zustand.mjs';
import { emit } from './eventStore.js';

const useFilterStore = create((set, get) => ({
    // 状態
    assignee: '',
    mainOnly: false,
    keyword: '',
    label: '',

    // アクション
    setFilter: (partial) => {
        set((state) => ({
            assignee: partial.assignee ?? state.assignee,
            mainOnly: partial.mainOnly ?? state.mainOnly,
            keyword: partial.keyword ?? state.keyword,
            label: partial.label ?? state.label,
        }));
        emit('filter-changed', get());
    },

    getFilter: () => {
        return { ...get() };
    },

    getFilterAssignee: () => {
        return get().assignee || '';
    },

    getFilterMainOnly: () => {
        return get().mainOnly;
    },

    getFilterLabel: () => {
        return get().label || '';
    },

    getSearchKeyword: () => {
        return get().keyword || '';
    },
}));

export default useFilterStore;

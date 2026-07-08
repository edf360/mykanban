import { create } from './zustand.mjs';
import { emit } from './eventStore.js';

const useModalStore = create((set, get) => ({
    // 状態
    editingTicketId: null,
    currentLabels: [],
    currentAssignees: [],
    mainAssignee: null,
    currentChildTasks: [],
    newTicketColumn: 'todo',
    currentCategory: '',

    // アクション
    setModalState: (partialState) => {
        set((state) => ({
            ...state,
            ...partialState,
        }));
        emit('modal-changed', get());
    },

    resetModalState: () => {
        set({
            editingTicketId: null,
            currentLabels: [],
            currentAssignees: [],
            mainAssignee: null,
            currentChildTasks: [],
            newTicketColumn: 'todo',
            currentCategory: '',
        });
        emit('modal-changed', get());
    },

    // 子タスク追加
    addChildTask: (task) => {
        set((state) => ({
            currentChildTasks: [...state.currentChildTasks, task],
        }));
        emit('modal-changed', get());
    },

    // 子タスク更新
    updateChildTask: (id, updates) => {
        set((state) => ({
            currentChildTasks: state.currentChildTasks.map(t =>
                t.id === id ? { ...t, ...updates } : t
            ),
        }));
        emit('modal-changed', get());
    },

    // 子タスク削除
    removeChildTask: (id) => {
        set((state) => ({
            currentChildTasks: state.currentChildTasks.filter(t => t.id !== id),
        }));
        emit('modal-changed', get());
    },

    // 子タスク一覧取得
    getChildTasks: () => {
        return [...get().currentChildTasks];
    },

    // 子タスク順序入れ替え
    reorderChildTasks: (fromId, targetIndex) => {
        set((state) => {
            const tasks = [...state.currentChildTasks];
            const fromIndex = tasks.findIndex(t => t.id === fromId);
            if (fromIndex < 0) return { currentChildTasks: tasks };
            if (fromIndex === targetIndex) return { currentChildTasks: tasks };

            const [task] = tasks.splice(fromIndex, 1);
            let insertIndex = targetIndex;
            if (targetIndex > fromIndex) {
                insertIndex = targetIndex - 1;
            }
            if (insertIndex < 0) insertIndex = 0;
            if (insertIndex > tasks.length) insertIndex = tasks.length;
            tasks.splice(insertIndex, 0, task);
            return { currentChildTasks: tasks };
        });
        emit('modal-changed', get());
    },

    // 担当者関連
    getCurrentAssignees: () => {
        return [...get().currentAssignees];
    },

    addAssignee: (text) => {
        const t = text.trim();
        set((state) => {
            if (t && !state.currentAssignees.includes(t)) {
                const newAssignees = [...state.currentAssignees, t];
                const newMainAssignee = state.mainAssignee || t;
                return {
                    currentAssignees: newAssignees,
                    mainAssignee: newMainAssignee,
                };
            }
            return {};
        });
        emit('modal-changed', get());
    },

    removeAssignee: (index) => {
        set((state) => {
            if (index < 0 || index >= state.currentAssignees.length) return {};
            const removed = state.currentAssignees[index];
            const newAssignees = [...state.currentAssignees];
            newAssignees.splice(index, 1);
            const newMainAssignee = state.mainAssignee === removed
                ? newAssignees[0] || null
                : state.mainAssignee;
            return {
                currentAssignees: newAssignees,
                mainAssignee: newMainAssignee,
            };
        });
        emit('modal-changed', get());
    },

    setMainAssignee: (assignee) => {
        set({ mainAssignee: assignee });
        emit('modal-changed', get());
    },

    getMainAssignee: () => {
        return get().mainAssignee;
    },

    // ラベル関連
    getCurrentLabels: () => {
        return [...get().currentLabels];
    },

    addLabel: (text) => {
        const t = text.trim();
        set((state) => {
            if (t && !state.currentLabels.includes(t)) {
                return { currentLabels: [...state.currentLabels, t] };
            }
            return {};
        });
        emit('modal-changed', get());
    },

    removeLabel: (labelName) => {
        set((state) => ({
            currentLabels: state.currentLabels.filter(l => l !== labelName),
        }));
        emit('modal-changed', get());
    },

    // セレクター
    getEditingTicketId: () => {
        return get().editingTicketId;
    },

    getNewTicketColumn: () => {
        return get().newTicketColumn;
    },

    setNewTicketColumn: (column) => {
        set({ newTicketColumn: column });
        emit('modal-changed', get());
    },

    getCurrentCategory: () => {
        return get().currentCategory || '';
    },

    setCurrentCategory: (category) => {
        set({ currentCategory: category || '' });
        emit('modal-changed', get());
    },
}));

export default useModalStore;

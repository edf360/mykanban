import { create } from './zustand.mjs';
import { emit } from './eventStore.js';

// 安全なparseInt
function safeParseInt(id) {
    const num = Number(id);
    return Number.isFinite(num) ? num : 0;
}

const useTicketStore = create((set, get) => ({
    // 状態
    tickets: new Map(),
    ticketOrder: [],
    ticketCounter: 0,
    draggedTicket: null,

    // アクション
    setTicket: (ticketId, ticket) => {
        set((state) => {
            const newTickets = new Map(state.tickets);
            newTickets.set(ticketId, ticket);
            let newOrder = state.ticketOrder;
            if (!state.ticketOrder.includes(ticketId)) {
                newOrder = [...state.ticketOrder, ticketId];
            }
            const id = safeParseInt(ticket.id);
            const newCounter = Math.max(state.ticketCounter, id);
            return {
                tickets: newTickets,
                ticketOrder: newOrder,
                ticketCounter: newCounter,
            };
        });
        emit('ticket-changed', { ticketId, ticket: get().tickets.get(ticketId) });
    },

    addTicket: (ticket) => {
        set((state) => {
            const newTickets = new Map(state.tickets);
            newTickets.set(ticket.ticketId, ticket);
            const newOrder = [...state.ticketOrder, ticket.ticketId];
            const id = safeParseInt(ticket.id);
            const newCounter = Math.max(state.ticketCounter, id);
            return {
                tickets: newTickets,
                ticketOrder: newOrder,
                ticketCounter: newCounter,
            };
        });
        emit('ticket-added', { ticket: get().tickets.get(get().ticketOrder[get().ticketOrder.length - 1]) });
    },

    removeTicket: (ticketId) => {
        set((state) => {
            const newTickets = new Map(state.tickets);
            newTickets.delete(ticketId);
            const newOrder = state.ticketOrder.filter(id => id !== ticketId);
            return {
                tickets: newTickets,
                ticketOrder: newOrder,
            };
        });
        emit('ticket-removed', { ticketId });
    },

    updateTicketField: (ticketId, field, value) => {
        set((state) => {
            const ticket = state.tickets.get(ticketId);
            if (ticket) {
                const updatedTicket = { ...ticket, [field]: value };
                const newTickets = new Map(state.tickets);
                newTickets.set(ticketId, updatedTicket);
                return { tickets: newTickets };
            }
            return {};
        });
        emit('ticket-changed', { ticketId, ticket: get().tickets.get(ticketId) });
    },

    initTickets: (tickets) => {
        const newTickets = new Map();
        const newOrder = [];
        let counter = 0;
        if (Array.isArray(tickets)) {
            tickets.forEach(ticket => {
                newTickets.set(ticket.ticketId, ticket);
                newOrder.push(ticket.ticketId);
                const id = safeParseInt(ticket.id);
                counter = Math.max(counter, id);
            });
        }
        set({
            tickets: newTickets,
            ticketOrder: newOrder,
            ticketCounter: counter,
        });
        emit('tickets-initialized', { count: newOrder.length });
    },

    getAllTickets: () => {
        return get().ticketOrder.map(id => get().tickets.get(id)).filter(Boolean);
    },

    getTicket: (ticketId) => {
        return get().tickets.get(ticketId) || null;
    },

    hasTicket: (ticketId) => {
        return get().tickets.has(ticketId);
    },

    findTicketIndex: (ticketId) => {
        return get().ticketOrder.findIndex(id => String(id) === String(ticketId));
    },

    getTicketCounter: () => {
        return get().ticketCounter;
    },

    // ドラッグ＆ドロップ関連
    setDraggedTicket: (ticket) => {
        set({ draggedTicket: ticket });
    },

    getDraggedTicket: () => {
        return get().draggedTicket;
    },
}));

export default useTicketStore;

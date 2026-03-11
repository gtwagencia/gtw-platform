import { create } from 'zustand';
import { getSocket } from '@/lib/socket';

interface Notification {
  id:        string;
  type:      'new_conversation' | 'new_message';
  title:     string;
  body:      string;
  read:      boolean;
  createdAt: Date;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount:   number;
  add:           (n: Omit<Notification, 'id' | 'read' | 'createdAt'>) => void;
  markAllRead:   () => void;
  initSocket:    () => void;
}

export const useNotifications = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount:   0,

  add: (n) => {
    const item: Notification = {
      ...n,
      id:        crypto.randomUUID(),
      read:      false,
      createdAt: new Date(),
    };
    set((s) => ({
      notifications: [item, ...s.notifications].slice(0, 50),
      unreadCount:   s.unreadCount + 1,
    }));
  },

  markAllRead: () =>
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount:   0,
    })),

  initSocket: () => {
    const socket = getSocket();

    socket.on('conversation:new', (payload: { contactName: string; conversationId: string }) => {
      get().add({
        type:  'new_conversation',
        title: 'Nova conversa',
        body:  `${payload.contactName} iniciou uma conversa`,
      });
    });

    socket.on('message:new', (msg: { direction: string; content: string }) => {
      if (msg.direction === 'inbound') {
        get().add({
          type:  'new_message',
          title: 'Nova mensagem',
          body:  msg.content || 'Mídia recebida',
        });
      }
    });
  },
}));

'use client';

import { useEffect, useRef } from 'react';
import { getSocket } from '@/lib/socket';
import type { Message, Conversation } from '@/types';

/**
 * Pede permissão de notificação no primeiro uso e dispara notificações
 * browser quando chegam mensagens enquanto a janela está em background.
 *
 * @param activeConversationId — ID da conversa atualmente aberta (para não
 *   duplicar notificações da conversa que o agente já está vendo)
 */
export function useNotifications(activeConversationId?: string) {
  const permissionRef = useRef<NotificationPermission>('default');

  // Solicita permissão uma única vez
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    permissionRef.current = Notification.permission;

    if (Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        permissionRef.current = p;
      });
    }
  }, []);

  // Escuta eventos de socket e dispara notificação quando em background
  useEffect(() => {
    const socket = getSocket();

    function onConversationNew(conv: Partial<Conversation> & { contactName?: string; conversationId: string }) {
      if (document.visibilityState === 'visible') return;
      if (permissionRef.current !== 'granted') return;

      new Notification('Nova conversa — GTW', {
        body: conv.contactName || 'Novo contato',
        icon: '/favicon.ico',
        tag:  `conv-new-${conv.conversationId}`,
      });
    }

    function onMessageNew(msg: Message & { sender_name?: string }) {
      if (document.visibilityState === 'visible') return;
      if (permissionRef.current !== 'granted') return;
      // Não notifica mensagens da conversa que está aberta
      if (activeConversationId && msg.conversation_id === activeConversationId) return;
      // Só notifica mensagens inbound
      if (msg.direction !== 'inbound') return;

      new Notification('Nova mensagem — GTW', {
        body: msg.content || 'Mídia recebida',
        icon: '/favicon.ico',
        tag:  `msg-${msg.id}`,
      });
    }

    socket.on('conversation:new',     onConversationNew);
    socket.on('message:new',          onMessageNew);

    return () => {
      socket.off('conversation:new',  onConversationNew);
      socket.off('message:new',       onMessageNew);
    };
  }, [activeConversationId]);
}

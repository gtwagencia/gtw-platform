'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { connectSocket } from '@/lib/socket';
import Header from '@/components/layout/Header';
import ConversationList from '@/components/chat/ConversationList';
import ChatWindow from '@/components/chat/ChatWindow';
import api from '@/lib/api';
import type { Conversation } from '@/types';
import { MessageSquare } from 'lucide-react';

function ConversationsInner() {
  const { currentWorkspace } = useAuth();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Conversation | null>(null);

  useEffect(() => {
    if (currentWorkspace) connectSocket(currentWorkspace.id);
  }, [currentWorkspace]);

  // Auto-select conversation from ?id= (link from Kanban card)
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || !currentWorkspace) return;
    api.get(`/workspaces/${currentWorkspace.id}/conversations/${id}`)
      .then(({ data }) => setSelected(data))
      .catch(() => {});
  }, [searchParams, currentWorkspace]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Conversas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace para ver as conversas
        </div>
      </>
    );
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <ConversationList
        workspaceId={currentWorkspace.id}
        selected={selected?.id ?? null}
        onSelect={setSelected}
      />

      {selected ? (
        <ChatWindow
          conversation={selected}
          onStatusChange={(updated) => setSelected(updated)}
        />
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-gray-50">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
            <MessageSquare className="w-8 h-8 text-gray-300" />
          </div>
          <h3 className="font-medium text-gray-900 mb-1">Nenhuma conversa selecionada</h3>
          <p className="text-gray-400 text-sm">Escolha uma conversa na lista para começar</p>
        </div>
      )}
    </div>
  );
}

export default function ConversationsPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ConversationsInner />
    </Suspense>
  );
}

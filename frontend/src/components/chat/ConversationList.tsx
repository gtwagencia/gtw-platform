'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Conversation } from '@/types';
import { Search, Filter } from 'lucide-react';

interface Props {
  workspaceId:    string;
  selected:       string | null;
  onSelect:       (conv: Conversation) => void;
}

const STATUS_TABS = [
  { key: 'open',     label: 'Abertas' },
  { key: 'pending',  label: 'Pendentes' },
  { key: 'resolved', label: 'Resolvidas' },
];

export default function ConversationList({ workspaceId, selected, onSelect }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status,  setStatus]  = useState('open');
  const [search,  setSearch]  = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${workspaceId}/conversations`, {
        params: { status, limit: 50 },
      });
      setConversations(data.data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, status]);

  useEffect(() => { load(); }, [load]);

  // Real-time updates
  useEffect(() => {
    const socket = getSocket();

    const onNew = (payload: { conversationId: string }) => {
      load();
    };
    const onUpdated = (conv: Partial<Conversation> & { conversationId: string }) => {
      setConversations((prev) =>
        prev.map((c) => c.id === conv.conversationId ? { ...c, ...conv } : c)
      );
    };

    socket.on('conversation:new',     onNew);
    socket.on('conversation:updated', onUpdated);
    return () => {
      socket.off('conversation:new',     onNew);
      socket.off('conversation:updated', onUpdated);
    };
  }, [load]);

  const filtered = conversations.filter((c) =>
    !search || c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_phone?.includes(search) ||
    c.last_message_text?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-80 flex flex-col border-r border-gray-200 bg-white flex-shrink-0">
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 text-sm"
            placeholder="Buscar conversa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 px-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={clsx(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              status === tab.key
                ? 'text-brand-600 border-b-2 border-brand-600'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-px p-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse flex gap-3 p-3 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-100 rounded w-3/4" />
                  <div className="h-3 bg-gray-100 rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <p className="text-gray-400 text-sm">Nenhuma conversa</p>
          </div>
        ) : (
          filtered.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={clsx(
                'w-full flex gap-3 p-3 mx-1 rounded-xl text-left transition-colors',
                selected === conv.id ? 'bg-brand-50' : 'hover:bg-gray-50'
              )}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm flex-shrink-0">
                {conv.contact_name?.[0]?.toUpperCase() || '?'}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {conv.contact_name}
                  </span>
                  {conv.last_message_at && (
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                      {formatDistanceToNow(new Date(conv.last_message_at), {
                        addSuffix: false, locale: ptBR,
                      })}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 truncate">
                    {conv.last_message_text || 'Sem mensagens'}
                  </p>
                  {conv.unread_count > 0 && (
                    <span className="ml-2 flex-shrink-0 w-5 h-5 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-medium">
                      {conv.unread_count > 9 ? '9+' : conv.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

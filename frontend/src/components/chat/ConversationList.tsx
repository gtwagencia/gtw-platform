'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Conversation } from '@/types';
import { Search, Filter, X, ChevronDown, AlertTriangle } from 'lucide-react';

interface Props {
  workspaceId: string;
  selected:    string | null;
  onSelect:    (conv: Conversation) => void;
}

interface FilterState {
  departmentId: string;
  inboxId:      string;
}

interface Option { id: string; name: string; }

const STATUS_TABS = [
  { key: 'open',     label: 'Abertas' },
  { key: 'pending',  label: 'Pendentes' },
  { key: 'resolved', label: 'Resolvidas' },
];

export default function ConversationList({ workspaceId, selected, onSelect }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [status,       setStatus]       = useState('open');
  const [search,       setSearch]       = useState('');
  const [loading,      setLoading]      = useState(true);
  const [showFilters,  setShowFilters]  = useState(false);
  const [filters,      setFilters]      = useState<FilterState>({ departmentId: '', inboxId: '' });
  const [departments,  setDepartments]  = useState<Option[]>([]);
  const [inboxes,      setInboxes]      = useState<Option[]>([]);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/departments`).then(({ data }) => setDepartments(data)).catch(() => {});
    api.get(`/workspaces/${workspaceId}/inboxes`).then(({ data }) => setInboxes(data)).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilters(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { status, limit: '50' };
      if (filters.departmentId) params.departmentId = filters.departmentId;
      if (filters.inboxId)      params.inboxId      = filters.inboxId;
      const { data } = await api.get(`/workspaces/${workspaceId}/conversations`, { params });
      setConversations(data.data);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, status, filters]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const socket = getSocket();
    const onNew     = () => load();
    const onUpdated = (conv: Partial<Conversation> & { conversationId: string }) => {
      setConversations((prev) => prev.map((c) => c.id === conv.conversationId ? { ...c, ...conv } : c));
    };
    socket.on('conversation:new',     onNew);
    socket.on('conversation:updated', onUpdated);
    return () => {
      socket.off('conversation:new',     onNew);
      socket.off('conversation:updated', onUpdated);
    };
  }, [load]);

  const activeFilters = (filters.departmentId ? 1 : 0) + (filters.inboxId ? 1 : 0);

  const filtered = conversations.filter((c) =>
    !search ||
    c.contact_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.contact_phone?.includes(search) ||
    c.last_message_text?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-80 flex flex-col border-r border-gray-200 bg-white flex-shrink-0">

      {/* Search + Filter */}
      <div className="p-3 border-b border-gray-100 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9 text-sm"
              placeholder="Buscar conversa..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={clsx(
                'relative p-2 rounded-lg border transition-colors',
                activeFilters > 0
                  ? 'border-brand-300 bg-brand-50 text-brand-700'
                  : 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50'
              )}
            >
              <Filter className="w-4 h-4" />
              {activeFilters > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-brand-600 text-white text-xs flex items-center justify-center font-medium">
                  {activeFilters}
                </span>
              )}
            </button>

            {showFilters && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Filtros</span>
                  {activeFilters > 0 && (
                    <button onClick={() => setFilters({ departmentId: '', inboxId: '' })} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                      <X className="w-3 h-3" />Limpar
                    </button>
                  )}
                </div>
                {departments.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
                    <div className="relative">
                      <select className="input text-sm pr-8 appearance-none" value={filters.departmentId} onChange={(e) => setFilters(prev => ({ ...prev, departmentId: e.target.value }))}>
                        <option value="">Todos</option>
                        {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}
                {inboxes.length > 0 && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Inbox</label>
                    <div className="relative">
                      <select className="input text-sm pr-8 appearance-none" value={filters.inboxId} onChange={(e) => setFilters(prev => ({ ...prev, inboxId: e.target.value }))}>
                        <option value="">Todos</option>
                        {inboxes.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex border-b border-gray-100 px-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={clsx(
              'flex-1 py-2.5 text-xs font-medium transition-colors',
              status === tab.key ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active filter chips */}
      {activeFilters > 0 && (
        <div className="flex gap-1 flex-wrap px-3 py-2 border-b border-gray-50">
          {filters.departmentId && (
            <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs px-2 py-0.5 rounded-full">
              {departments.find(d => d.id === filters.departmentId)?.name}
              <button onClick={() => setFilters(p => ({ ...p, departmentId: '' }))} className="hover:text-brand-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
          {filters.inboxId && (
            <span className="inline-flex items-center gap-1 bg-brand-50 text-brand-700 text-xs px-2 py-0.5 rounded-full">
              {inboxes.find(i => i.id === filters.inboxId)?.name}
              <button onClick={() => setFilters(p => ({ ...p, inboxId: '' }))} className="hover:text-brand-900"><X className="w-2.5 h-2.5" /></button>
            </span>
          )}
        </div>
      )}

      {/* Conversation list */}
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
                selected === conv.id ? 'bg-brand-50' : 'hover:bg-gray-50',
                conv.sla_breached && 'border-l-2 border-red-400 pl-2'
              )}
            >
              {/* Avatar with SLA indicator */}
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 font-medium text-sm flex-shrink-0 relative">
                {conv.contact_name?.[0]?.toUpperCase() || '?'}
                {conv.sla_breached && (
                  <span className="absolute -top-1 -right-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500 fill-red-100" />
                  </span>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-gray-900 truncate">{conv.contact_name}</span>
                  {conv.last_message_at && (
                    <span className="text-xs text-gray-400 ml-2 flex-shrink-0">
                      {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false, locale: ptBR })}
                    </span>
                  )}
                </div>

                {/* Department + labels */}
                <div className="flex items-center gap-1 flex-wrap mb-0.5">
                  {conv.department_name && (
                    <span className="text-xs font-medium" style={{ color: conv.department_color || '#6366f1' }}>
                      {conv.department_name}
                    </span>
                  )}
                  {conv.labels?.slice(0, 2).map(l => (
                    <span
                      key={l.id}
                      className="text-xs px-1 py-0 rounded font-medium"
                      style={{ backgroundColor: l.color + '25', color: l.color }}
                    >
                      {l.name}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-500 truncate">{conv.last_message_text || 'Sem mensagens'}</p>
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

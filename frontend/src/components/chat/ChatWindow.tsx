'use client';

import { useEffect, useRef, useState, FormEvent } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/store/auth';
import { joinConversation, getSocket } from '@/lib/socket';
import type { Conversation, Message } from '@/types';
import {
  Send, Check, CheckCheck, AlertCircle,
  Archive, UserCheck, ChevronDown,
} from 'lucide-react';

interface Props {
  conversation: Conversation;
  onStatusChange: (conv: Conversation) => void;
}

interface Agent { id: string; name: string; avatar_url: string | null; }

export default function ChatWindow({ conversation, onStatusChange }: Props) {
  const { user, currentWorkspace } = useAuth();

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [text,        setText]        = useState('');
  const [sending,     setSending]     = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [agents,      setAgents]      = useState<Agent[]>([]);
  const [assignOpen,  setAssignOpen]  = useState(false);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const assignRef  = useRef<HTMLDivElement>(null);

  // ── Load messages + agents ─────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    api.get(`/conversations/${conversation.id}/messages`)
      .then(({ data }) => setMessages(data.data))
      .finally(() => setLoading(false));

    api.post(`/workspaces/${conversation.workspace_id}/conversations/${conversation.id}/read`)
      .catch(() => {});

    joinConversation(conversation.id);

    const socket = getSocket();
    const onNew = (msg: Message) => {
      if (msg.conversation_id === conversation.id) {
        setMessages((prev) => [...prev, msg]);
      }
    };
    socket.on('message:new', onNew);
    return () => { socket.off('message:new', onNew); };
  }, [conversation.id]);

  // Load workspace members for assignment
  useEffect(() => {
    if (!currentWorkspace) return;
    api.get(`/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}/members`)
      .then(({ data }) => setAgents(data))
      .catch(() => {});
  }, [currentWorkspace]);

  // Close assign dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) {
        setAssignOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Actions ────────────────────────────────────────────────────

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      const { data } = await api.post(`/conversations/${conversation.id}/messages`, { content });
      setMessages((prev) => [...prev, data]);
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: string) {
    const { data } = await api.put(
      `/workspaces/${conversation.workspace_id}/conversations/${conversation.id}`,
      { status }
    );
    onStatusChange(data);
  }

  async function assignTo(agentId: string | null) {
    const { data } = await api.put(
      `/workspaces/${conversation.workspace_id}/conversations/${conversation.id}`,
      { assigneeId: agentId }
    );
    onStatusChange(data);
    setAssignOpen(false);
  }

  const statusIcon = (s: string) => {
    if (s === 'sent')      return <Check       className="w-3 h-3" />;
    if (s === 'delivered') return <CheckCheck  className="w-3 h-3" />;
    if (s === 'read')      return <CheckCheck  className="w-3 h-3 text-blue-300" />;
    if (s === 'failed')    return <AlertCircle className="w-3 h-3 text-red-300" />;
    return null;
  };

  const isResolved = conversation.status === 'resolved';

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-w-0">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center
                        text-brand-700 font-semibold text-sm flex-shrink-0">
          {conversation.contact_name?.[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm truncate">
            {conversation.contact_name}
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
            <span>{conversation.contact_phone}</span>
            <span>·</span>
            <span>{conversation.inbox_name}</span>
            {(conversation as any).department_name && (
              <>
                <span>·</span>
                <span
                  className="font-medium"
                  style={{ color: (conversation as any).department_color || '#6366f1' }}
                >
                  {(conversation as any).department_name}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Assign agent */}
        <div className="relative flex-shrink-0" ref={assignRef}>
          <button
            onClick={() => setAssignOpen(!assignOpen)}
            className={clsx(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              conversation.assignee_name
                ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            )}
          >
            <UserCheck className="w-3.5 h-3.5" />
            {conversation.assignee_name || 'Não atribuído'}
            <ChevronDown className={clsx('w-3 h-3 transition-transform', assignOpen && 'rotate-180')} />
          </button>

          {assignOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl
                            border border-gray-200 overflow-hidden z-20">
              <div className="p-1">
                <button
                  onClick={() => assignTo(null)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50
                             rounded-lg flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">
                    —
                  </div>
                  Remover atribuição
                </button>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => assignTo(agent.id)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg flex items-center gap-2',
                      conversation.assignee_id === agent.id
                        ? 'text-brand-700 font-medium'
                        : 'text-gray-700'
                    )}
                  >
                    <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center
                                    text-brand-700 text-xs font-medium flex-shrink-0">
                      {agent.name[0]?.toUpperCase()}
                    </div>
                    <span className="truncate">{agent.name}</span>
                    {conversation.assignee_id === agent.id && (
                      <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isResolved ? (
            <button onClick={() => changeStatus('resolved')} className="btn-secondary text-xs py-1.5 px-3">
              <CheckCheck className="w-3.5 h-3.5" />
              Resolver
            </button>
          ) : (
            <button onClick={() => changeStatus('open')} className="btn-secondary text-xs py-1.5 px-3">
              <Archive className="w-3.5 h-3.5" />
              Reabrir
            </button>
          )}
        </div>
      </div>

      {/* ── Messages ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            Nenhuma mensagem ainda
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isOut      = msg.direction === 'outbound';
            const prevMsg    = messages[idx - 1];
            const showSender = isOut && msg.sender_name
              && (idx === 0 || prevMsg?.sender_id !== msg.sender_id || prevMsg?.direction !== 'outbound');
            const isMe       = msg.sender_id === user?.id;

            return (
              <div key={msg.id} className={clsx('flex flex-col', isOut ? 'items-end' : 'items-start')}>

                {/* Sender name — só aparece em outbound quando muda de remetente */}
                {showSender && (
                  <span className={clsx(
                    'text-xs font-medium mb-1 px-1',
                    isMe ? 'text-brand-600' : 'text-purple-600'
                  )}>
                    {isMe ? 'Você' : msg.sender_name}
                  </span>
                )}

                <div className={clsx(
                  'max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  isOut
                    ? isMe
                      ? 'bg-brand-600 text-white rounded-br-sm'
                      : 'bg-purple-600 text-white rounded-br-sm'   // outro agente
                    : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                )}>
                  {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                  {msg.media_url && (
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
                       className="text-xs underline opacity-75">
                      Ver mídia
                    </a>
                  )}
                  <div className={clsx(
                    'flex items-center justify-end gap-1 mt-1 text-xs',
                    isOut ? 'text-white/60' : 'text-gray-400'
                  )}>
                    <span>{format(new Date(msg.created_at), 'HH:mm', { locale: ptBR })}</span>
                    {isOut && statusIcon(msg.status)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Input ────────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-200 px-3 py-2 flex-shrink-0">
        {/* Sender badge */}
        {user && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center
                            text-white text-xs font-bold flex-shrink-0">
              {user.name[0]?.toUpperCase()}
            </div>
            <span className="text-xs text-gray-400">Respondendo como <strong className="text-gray-600">{user.name}</strong></span>
          </div>
        )}
        <form onSubmit={sendMessage} className="flex gap-2">
          <input
            className="input flex-1"
            placeholder={isResolved ? 'Conversa resolvida' : 'Digite uma mensagem...'}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={isResolved}
          />
          <button
            type="submit"
            className="btn-primary px-4"
            disabled={!text.trim() || sending || isResolved}
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

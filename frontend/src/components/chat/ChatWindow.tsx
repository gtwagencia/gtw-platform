'use client';

import { useEffect, useRef, useState, FormEvent, useCallback } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';
import api from '@/lib/api';
import { useAuth } from '@/store/auth';
import { joinConversation, getSocket } from '@/lib/socket';
import type { Conversation, Message, Label, CannedResponse } from '@/types';
import {
  Send, Check, CheckCheck, AlertCircle,
  Archive, UserCheck, ChevronDown, Lock, Tag, X, Star, FileText, Paperclip,
} from 'lucide-react';

interface Props {
  conversation: Conversation;
  onStatusChange: (conv: Conversation) => void;
}

interface Agent { id: string; name: string; avatar_url: string | null; }

type Mode = 'reply' | 'note';

export default function ChatWindow({ conversation, onStatusChange }: Props) {
  const { user, currentWorkspace } = useAuth();

  const [messages,      setMessages]      = useState<Message[]>([]);
  const [text,          setText]          = useState('');
  const [mode,          setMode]          = useState<Mode>('reply');
  const [sending,       setSending]       = useState(false);
  const [loading,       setLoading]       = useState(true);
  const [agents,        setAgents]        = useState<Agent[]>([]);
  const [labels,        setLabels]        = useState<Label[]>([]);
  const [convLabels,    setConvLabels]    = useState<Label[]>([]);
  const [canned,        setCanned]        = useState<CannedResponse[]>([]);
  const [cannedSearch,  setCannedSearch]  = useState('');
  const [showCanned,    setShowCanned]    = useState(false);
  const [assignOpen,    setAssignOpen]    = useState(false);
  const [labelOpen,     setLabelOpen]     = useState(false);
  const [showCsat,      setShowCsat]      = useState(false);
  const [csatRating,    setCsatRating]    = useState(0);
  const [csatSent,      setCsatSent]      = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const assignRef  = useRef<HTMLDivElement>(null);
  const labelRef   = useRef<HTMLDivElement>(null);
  const textRef    = useRef<HTMLTextAreaElement>(null);

  // ── Load messages ──────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setMode('reply');
    setText('');
    setShowCanned(false);

    api.get(`/conversations/${conversation.id}/messages`)
      .then(({ data }) => setMessages(data.data))
      .finally(() => setLoading(false));

    api.post(`/workspaces/${conversation.workspace_id}/conversations/${conversation.id}/read`)
      .catch(() => {});

    joinConversation(conversation.id);

    const socket = getSocket();
    const onNew = (msg: Message) => {
      if (msg.conversation_id === conversation.id) {
        setMessages((prev) => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);
      }
    };
    const onStatus = ({ evolutionMsgId, status }: { evolutionMsgId: string; status: string }) => {
      setMessages((prev) => prev.map((m) =>
        m.evolution_msg_id === evolutionMsgId
          ? { ...m, status: status as Message['status'] }
          : m
      ));
    };
    socket.on('message:new',    onNew);
    socket.on('message:status', onStatus);
    return () => {
      socket.off('message:new',    onNew);
      socket.off('message:status', onStatus);
    };
  }, [conversation.id]);

  // Load agents, labels, canned
  useEffect(() => {
    if (!currentWorkspace) return;
    api.get(`/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}/members`)
      .then(({ data }) => setAgents(data)).catch(() => {});
    api.get(`/workspaces/${currentWorkspace.id}/labels`)
      .then(({ data }) => setLabels(data)).catch(() => {});
    api.get(`/workspaces/${currentWorkspace.id}/canned`)
      .then(({ data }) => setCanned(data)).catch(() => {});
  }, [currentWorkspace]);

  useEffect(() => {
    setConvLabels(conversation.labels || []);
  }, [conversation.labels]);

  useEffect(() => {
    if (!currentWorkspace || !showCanned) return;
    api.get(`/workspaces/${currentWorkspace.id}/canned`, { params: { search: cannedSearch } })
      .then(({ data }) => setCanned(data)).catch(() => {});
  }, [cannedSearch, currentWorkspace, showCanned]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (assignRef.current && !assignRef.current.contains(e.target as Node)) setAssignOpen(false);
      if (labelRef.current  && !labelRef.current.contains(e.target as Node))  setLabelOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleTextChange(val: string) {
    setText(val);
    if (val.startsWith('/') && mode === 'reply') {
      setCannedSearch(val.slice(1));
      setShowCanned(true);
    } else {
      setShowCanned(false);
    }
  }

  const filteredCanned = canned.filter(c =>
    !cannedSearch ||
    c.shortcut.includes(cannedSearch.toLowerCase()) ||
    c.content.toLowerCase().includes(cannedSearch.toLowerCase())
  );

  // ── Actions ────────────────────────────────────────────────────

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    const content   = text.trim();
    const isPrivate = mode === 'note';
    setText('');
    setShowCanned(false);
    setSending(true);
    try {
      const { data } = await api.post(`/conversations/${conversation.id}/messages`, { content, isPrivate });
      setMessages((prev) => [...prev, data]);
    } catch {
      setText(content);
    } finally {
      setSending(false);
    }
  }

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || sending || uploading) return;
    e.target.value = '';

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data: upload } = await api.post('/uploads', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { data } = await api.post(`/conversations/${conversation.id}/messages`, {
        content:     file.name,
        messageType: upload.type,
        mediaUrl:    upload.url,
        isPrivate:   mode === 'note',
      });
      setMessages((prev) => prev.some(m => m.id === data.id) ? prev : [...prev, data]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      alert(msg || 'Erro ao enviar arquivo. Verifique o tipo e tamanho (máx 20MB).');
    } finally {
      setUploading(false);
    }
  }, [conversation.id, mode, sending, uploading]);

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

  async function toggleLabel(label: Label) {
    const has = convLabels.some(l => l.id === label.id);
    if (has) {
      await api.delete(`/workspaces/${conversation.workspace_id}/labels/conversation/${conversation.id}/${label.id}`);
      setConvLabels(prev => prev.filter(l => l.id !== label.id));
    } else {
      await api.post(`/workspaces/${conversation.workspace_id}/labels/conversation/${conversation.id}`, { labelId: label.id });
      setConvLabels(prev => [...prev, label]);
    }
  }

  async function sendCsatRequest() {
    // Envia mensagem de pesquisa CSAT para o cliente via WhatsApp
    const csatMsg = `Olá! Seu atendimento foi encerrado. Como você avalia nosso serviço hoje?\n\nResponda com um número:\n1 ⭐ - Péssimo\n2 ⭐ - Ruim\n3 ⭐ - Regular\n4 ⭐ - Bom\n5 ⭐ - Ótimo`;
    await api.post(`/conversations/${conversation.id}/messages`, { content: csatMsg });
    setCsatSent(true);
  }

  async function submitCsat() {
    if (!csatRating) return;
    await api.post(
      `/workspaces/${conversation.workspace_id}/conversations/${conversation.id}/csat`,
      { rating: csatRating }
    );
    setShowCsat(false);
    setCsatSent(false);
    setCsatRating(0);
    onStatusChange({ ...conversation, csat_rating: csatRating });
  }

  const statusIcon = (s: string) => {
    if (s === 'sent')      return <Check       className="w-3.5 h-3.5 opacity-70" />;
    if (s === 'delivered') return <CheckCheck  className="w-3.5 h-3.5 opacity-90" />;
    if (s === 'read')      return <CheckCheck  className="w-3.5 h-3.5 text-blue-300" />;
    if (s === 'failed')    return <AlertCircle className="w-3.5 h-3.5 text-red-300" />;
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
          <div className="font-medium text-gray-900 text-sm truncate flex items-center gap-2">
            {conversation.contact_name}
            {conversation.sla_breached && (
              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">SLA</span>
            )}
            {conversation.bot_active && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">Bot</span>
            )}
          </div>
          <div className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
            <span>{conversation.contact_phone}</span>
            <span>·</span>
            <span>{conversation.inbox_name}</span>
            {conversation.department_name && (
              <>
                <span>·</span>
                <span className="font-medium" style={{ color: conversation.department_color || '#6366f1' }}>
                  {conversation.department_name}
                </span>
              </>
            )}
          </div>
          {convLabels.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-0.5">
              {convLabels.map(l => (
                <span
                  key={l.id}
                  className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: l.color + '20', color: l.color }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Labels */}
        <div className="relative flex-shrink-0" ref={labelRef}>
          <button
            onClick={() => setLabelOpen(!labelOpen)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Etiquetas"
          >
            <Tag className="w-4 h-4" />
          </button>
          {labelOpen && labels.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-200 z-20 p-1.5">
              {labels.map(l => {
                const active = convLabels.some(cl => cl.id === l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-sm rounded-lg hover:bg-gray-50 text-left"
                  >
                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: l.color }} />
                    <span className="flex-1 truncate">{l.name}</span>
                    {active && <Check className="w-3.5 h-3.5 text-brand-600" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* CSAT */}
        <button
          onClick={() => { setShowCsat(true); setCsatSent(false); setCsatRating(0); }}
          className={clsx(
            'flex-shrink-0 p-1.5 rounded-lg transition-colors',
            conversation.csat_rating
              ? 'text-yellow-500 hover:bg-yellow-50'
              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
          )}
          title={conversation.csat_rating ? `CSAT: ${conversation.csat_rating}/5` : 'Pesquisa de satisfação'}
        >
          <Star className={clsx('w-4 h-4', conversation.csat_rating && 'fill-yellow-400')} />
        </button>

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
                  className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg flex items-center gap-2"
                >
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-gray-400 text-xs">—</div>
                  Remover atribuição
                </button>
                {agents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => assignTo(agent.id)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 rounded-lg flex items-center gap-2',
                      conversation.assignee_id === agent.id ? 'text-brand-700 font-medium' : 'text-gray-700'
                    )}
                  >
                    <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center
                                    text-brand-700 text-xs font-medium flex-shrink-0">
                      {agent.name[0]?.toUpperCase()}
                    </div>
                    <span className="truncate">{agent.name}</span>
                    {conversation.assignee_id === agent.id && <Check className="w-3.5 h-3.5 ml-auto flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status */}
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
            const isPrivate  = msg.is_private;
            const prevMsg    = messages[idx - 1];
            const showSender = isOut && msg.sender_name
              && (idx === 0 || prevMsg?.sender_id !== msg.sender_id || prevMsg?.direction !== 'outbound');
            const isMe       = msg.sender_id === user?.id;

            if (isPrivate) {
              return (
                <div key={msg.id} className="flex flex-col items-center">
                  <div className="max-w-md w-full bg-amber-50 border border-amber-200 rounded-2xl px-4 py-2.5 text-sm shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lock className="w-3 h-3 text-amber-600" />
                      <span className="text-xs font-medium text-amber-700">Nota interna</span>
                      {msg.sender_name && (
                        <span className="text-xs text-amber-600">· {isMe ? 'Você' : msg.sender_name}</span>
                      )}
                    </div>
                    {msg.content && <p className="whitespace-pre-wrap break-words text-gray-800">{msg.content}</p>}
                    <div className="text-xs text-amber-500 mt-1">
                      {format(new Date(msg.created_at), 'HH:mm', { locale: ptBR })}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div key={msg.id} className={clsx('flex flex-col', isOut ? 'items-end' : 'items-start')}>
                {showSender && (
                  <span className={clsx('text-xs font-medium mb-1 px-1', isMe ? 'text-brand-600' : 'text-purple-600')}>
                    {isMe ? 'Você' : msg.sender_name}
                  </span>
                )}
                <div className={clsx(
                  'max-w-xs lg:max-w-md xl:max-w-lg rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  isOut
                    ? isMe
                      ? 'bg-brand-600 text-white rounded-br-sm'
                      : 'bg-purple-600 text-white rounded-br-sm'
                    : 'bg-white text-gray-900 rounded-bl-sm border border-gray-100'
                )}>
                  {msg.message_type === 'image' && msg.media_url ? (
                    <a href={msg.media_url} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={msg.media_url}
                        alt="imagem"
                        className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                      />
                      {msg.content && msg.content !== msg.media_url && (
                        <p className="whitespace-pre-wrap break-words mt-1 text-xs opacity-80">{msg.content}</p>
                      )}
                    </a>
                  ) : msg.message_type === 'sticker' && msg.media_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={msg.media_url} alt="sticker" className="w-28 h-28 object-contain" />
                  ) : msg.message_type === 'audio' && msg.media_url ? (
                    <audio
                      controls
                      src={msg.media_url}
                      preload="metadata"
                      className="max-w-[260px] h-10 accent-current"
                      style={{ colorScheme: isOut ? 'dark' : 'light' }}
                    />
                  ) : msg.message_type === 'video' && msg.media_url ? (
                    <div>
                      <video
                        controls
                        src={msg.media_url}
                        preload="metadata"
                        className="rounded-lg max-w-full max-h-48"
                      />
                      {msg.content && (
                        <p className="whitespace-pre-wrap break-words mt-1 text-xs opacity-80">{msg.content}</p>
                      )}
                    </div>
                  ) : msg.media_url ? (
                    <a
                      href={msg.media_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="flex items-center gap-2 text-xs underline opacity-80 hover:opacity-100"
                    >
                      <FileText className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate max-w-[180px]">{msg.content || 'Arquivo'}</span>
                    </a>
                  ) : msg.content ? (
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                  ) : null}
                  <div className={clsx('flex items-center justify-end gap-1 mt-1 text-xs', isOut ? 'text-white/60' : 'text-gray-400')}>
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

      {/* ── CSAT Modal ────────────────────────────────────────── */}
      {showCsat && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowCsat(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-80" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Pesquisa de satisfação</h3>
              <button onClick={() => setShowCsat(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1 — send to client */}
            {!csatSent ? (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Envie uma pesquisa de satisfação para o cliente responder pelo WhatsApp.
                </p>
                <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 mb-4 leading-relaxed">
                  "Como você avalia nosso serviço hoje? Responda com 1 a 5 ⭐"
                </div>
                <button onClick={sendCsatRequest} className="btn-primary w-full mb-2">
                  Enviar pesquisa ao cliente
                </button>
                <button onClick={() => setShowCsat(false)} className="btn-secondary w-full text-sm">
                  Cancelar
                </button>
              </>
            ) : (
              /* Step 2 — record the rating after client replies */
              <>
                <p className="text-sm text-gray-500 mb-1">Pesquisa enviada! ✓</p>
                <p className="text-sm text-gray-400 mb-4">Após o cliente responder, registre a nota abaixo:</p>
                <div className="flex gap-2 justify-center mb-5">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setCsatRating(n)} className="transition-transform hover:scale-110">
                      <Star className={clsx('w-8 h-8', n <= csatRating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300')} />
                    </button>
                  ))}
                </div>
                <button onClick={submitCsat} disabled={!csatRating} className="btn-primary w-full mb-2">
                  Salvar nota
                </button>
                <button onClick={() => setShowCsat(false)} className="btn-secondary w-full text-sm">
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Input ────────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-200 flex-shrink-0">
        {/* Mode tabs */}
        <div className="flex border-b border-gray-100 px-3">
          <button
            onClick={() => setMode('reply')}
            className={clsx(
              'py-2 px-3 text-xs font-medium transition-colors',
              mode === 'reply' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-400 hover:text-gray-600'
            )}
          >
            Responder
          </button>
          <button
            onClick={() => setMode('note')}
            className={clsx(
              'flex items-center gap-1 py-2 px-3 text-xs font-medium transition-colors',
              mode === 'note' ? 'text-amber-600 border-b-2 border-amber-500' : 'text-gray-400 hover:text-gray-600'
            )}
          >
            <Lock className="w-3 h-3" />
            Nota interna
          </button>
        </div>

        <div className="px-3 py-2">
          {user && mode === 'reply' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-4 h-4 rounded-full bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {user.name[0]?.toUpperCase()}
              </div>
              <span className="text-xs text-gray-400">Respondendo como <strong className="text-gray-600">{user.name}</strong></span>
            </div>
          )}
          {mode === 'note' && (
            <div className="flex items-center gap-1.5 mb-1.5">
              <Lock className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-amber-600 font-medium">Visível apenas para agentes</span>
            </div>
          )}

          {/* Canned responses autocomplete */}
          {showCanned && filteredCanned.length > 0 && (
            <div className="mb-2 max-h-48 overflow-y-auto border border-gray-200 rounded-xl bg-white shadow-lg">
              {filteredCanned.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setText(c.content); setShowCanned(false); textRef.current?.focus(); }}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-0"
                >
                  <div className="text-xs font-semibold text-brand-600">/{c.shortcut}</div>
                  <div className="text-sm text-gray-700 truncate">{c.content}</div>
                </button>
              ))}
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileUpload}
          />

          <form onSubmit={sendMessage} className="flex gap-2">
            <textarea
              ref={textRef}
              rows={2}
              className={clsx(
                'input flex-1 resize-none',
                mode === 'note' && 'bg-amber-50 border-amber-200 focus:ring-amber-400'
              )}
              placeholder={
                isResolved
                  ? 'Conversa resolvida'
                  : mode === 'note'
                  ? 'Escreva uma nota interna...'
                  : 'Digite uma mensagem... (use / para respostas prontas)'
              }
              value={text}
              onChange={(e) => handleTextChange(e.target.value)}
              disabled={isResolved}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e as any); }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isResolved || uploading}
              className="px-3 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors flex items-center justify-center"
              title="Enviar arquivo ou imagem"
            >
              {uploading
                ? <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                : <Paperclip className="w-4 h-4" />
              }
            </button>

            <button
              type="submit"
              className={clsx(
                'px-4 rounded-xl flex items-center justify-center transition-colors',
                mode === 'note' ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'btn-primary'
              )}
              disabled={!text.trim() || sending || isResolved}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

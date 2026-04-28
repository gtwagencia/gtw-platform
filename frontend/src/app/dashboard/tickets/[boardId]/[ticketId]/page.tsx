'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import api from '@/lib/api';
import Header from '@/components/layout/Header';
import type { Ticket, TicketColumn, TicketBoardMember, TicketLabel, TicketTimeLog, TicketPriority } from '@/types';
import {
  ArrowLeft, RefreshCw, Trash2, Send, Paperclip, X, Download,
  FileText, Image, Film, Music, Clock, Calendar, User, Flag, Tag,
  Play, Square, Timer, Phone, Check, ExternalLink, AlertCircle,
} from 'lucide-react';
import clsx from 'clsx';
import { format, isPast, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Attachment {
  id: string; file_name: string; file_url: string;
  file_size: number; mime_type: string | null; created_at: string;
  user_name?: string;
}

interface Comment {
  id: string; content: string | null; created_at: string;
  user_name: string | null; user_avatar: string | null;
  attachments: Attachment[];
}

interface StorageUsage {
  used_bytes: number; quota_bytes: number; quota_mb: number; used_mb: number; pct: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string; border: string }> = {
  low:    { label: 'Baixa',   color: 'text-gray-500',   bg: 'bg-gray-50',    border: 'border-gray-200' },
  medium: { label: 'Média',   color: 'text-blue-600',   bg: 'bg-blue-50',    border: 'border-blue-200' },
  high:   { label: 'Alta',    color: 'text-orange-600', bg: 'bg-orange-50',  border: 'border-orange-200' },
  urgent: { label: 'Urgente', color: 'text-red-600',    bg: 'bg-red-50',     border: 'border-red-200' },
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function fileIcon(mime: string | null) {
  if (!mime) return <FileText className="w-4 h-4" />;
  if (mime.startsWith('image/')) return <Image className="w-4 h-4" />;
  if (mime.startsWith('video/')) return <Film className="w-4 h-4" />;
  if (mime.startsWith('audio/')) return <Music className="w-4 h-4" />;
  return <FileText className="w-4 h-4" />;
}

function isImage(mime: string | null) {
  return mime?.startsWith('image/') ?? false;
}

// ── Attachment chip ───────────────────────────────────────────────────────────

function AttachmentChip({ att, onDelete }: { att: Attachment; onDelete?: () => void }) {
  return (
    <div className="group flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs">
      <span className="text-gray-400">{fileIcon(att.mime_type)}</span>
      <a href={att.file_url} target="_blank" rel="noopener noreferrer"
         className="font-medium text-gray-700 hover:text-indigo-600 truncate max-w-[160px]">
        {att.file_name}
      </a>
      <span className="text-gray-400 flex-shrink-0">{formatBytes(att.file_size)}</span>
      <a href={att.file_url} target="_blank" rel="noopener noreferrer" download
         className="text-gray-400 hover:text-gray-600 flex-shrink-0">
        <Download className="w-3 h-3" />
      </a>
      {onDelete && (
        <button onClick={onDelete} className="text-gray-300 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace, user } = useAuth();
  const boardId  = params.boardId  as string;
  const ticketId = params.ticketId as string;

  const [ticket,       setTicket]       = useState<Ticket | null>(null);
  const [columns,      setColumns]      = useState<TicketColumn[]>([]);
  const [members,      setMembers]      = useState<TicketBoardMember[]>([]);
  const [labels,       setLabels]       = useState<TicketLabel[]>([]);
  const [comments,     setComments]     = useState<Comment[]>([]);
  const [attachments,  setAttachments]  = useState<Attachment[]>([]);
  const [storage,      setStorage]      = useState<StorageUsage | null>(null);
  const [timeLogs,     setTimeLogs]     = useState<TicketTimeLog[]>([]);
  const [activeTimer,  setActiveTimer]  = useState<TicketTimeLog | null>(null);
  const [timerSecs,    setTimerSecs]    = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [commentText,  setCommentText]  = useState('');
  const [commentFile,  setCommentFile]  = useState<File | null>(null);
  const [submitting,   setSubmitting]   = useState(false);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileRef   = useRef<HTMLInputElement>(null);

  const canEdit = true; // board role check simplified — backend enforces permissions

  // ── Load all data ──────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [tRes, bRes, mRes, lRes, cRes, aRes, sRes, tlRes] = await Promise.all([
        api.get(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/boards/${boardId}`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/boards/${boardId}/members`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/labels`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}/comments`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}/attachments`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/storage`),
        api.get(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticketId}/time-logs`),
      ]);
      setTicket(tRes.data);
      setColumns(bRes.data.columns || []);
      setMembers(mRes.data);
      setLabels(lRes.data);
      setComments(cRes.data);
      setAttachments(aRes.data);
      setStorage(sRes.data);
      setTimeLogs(tlRes.data.logs);
      if (tlRes.data.active) {
        setActiveTimer(tlRes.data.active);
        setTimerSecs(Math.floor((Date.now() - new Date(tlRes.data.active.started_at).getTime()) / 1000));
        setTimerRunning(true);
      }
    } catch { router.push(`/dashboard/tickets/${boardId}`); }
    finally { setLoading(false); }
  }, [currentWorkspace, ticketId, boardId]);

  useEffect(() => { load(); }, [load]);

  // Timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSecs(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Patch ticket ───────────────────────────────────────────────────────────

  async function patch(fields: Partial<Ticket>) {
    if (!currentWorkspace || !ticket) return;
    setSaving(true);
    try {
      const { data } = await api.put<Ticket>(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}`, fields);
      setTicket(data);
    } finally { setSaving(false); }
  }

  // ── Timer ──────────────────────────────────────────────────────────────────

  async function startTimer() {
    if (!currentWorkspace || !ticket) return;
    const { data } = await api.post<TicketTimeLog>(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}/time-logs/start`);
    setActiveTimer(data); setTimerSecs(0); setTimerRunning(true);
  }

  async function stopTimer() {
    if (!currentWorkspace || !ticket) return;
    setTimerRunning(false); setActiveTimer(null);
    await api.post(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}/time-logs/stop`);
    load();
  }

  // ── Comments & attachments ─────────────────────────────────────────────────

  async function submitComment(e: React.FormEvent) {
    e.preventDefault();
    if ((!commentText.trim() && !commentFile) || !currentWorkspace || !ticket) return;
    setSubmitting(true);
    try {
      const form = new FormData();
      form.append('content', commentText.trim());
      if (commentFile) form.append('file', commentFile);
      const { data } = await api.post<Comment>(
        `/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}/comments`,
        form, { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setComments(prev => [...prev, data]);
      setCommentText('');
      setCommentFile(null);
      if (storage) {
        const { data: s } = await api.get(`/workspaces/${currentWorkspace.id}/tickets/storage`);
        setStorage(s);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar comentário');
    } finally { setSubmitting(false); }
  }

  async function deleteComment(commentId: string) {
    if (!currentWorkspace || !ticket) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}/comments/${commentId}`);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }

  async function uploadAttachment(file: File) {
    if (!currentWorkspace || !ticket) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post<Attachment>(
        `/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}/attachments`,
        form, { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setAttachments(prev => [data, ...prev]);
      const { data: s } = await api.get(`/workspaces/${currentWorkspace.id}/tickets/storage`);
      setStorage(s);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar arquivo');
    }
  }

  async function deleteAttachment(attId: string) {
    if (!currentWorkspace || !ticket) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}/attachments/${attId}`);
    setAttachments(prev => prev.filter(a => a.id !== attId));
  }

  async function deleteTicket() {
    if (!currentWorkspace || !ticket || !confirm('Excluir este ticket?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/tickets/tickets/${ticket.id}`);
    router.push(`/dashboard/tickets/${boardId}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!currentWorkspace) return null;

  if (loading) {
    return (
      <>
        <Header title="Ticket" />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </>
    );
  }

  if (!ticket) return null;

  const priority   = PRIORITY_CONFIG[ticket.priority];
  const isOverdue  = ticket.due_date && isPast(new Date(ticket.due_date)) && !ticket.resolved_at;
  const storageWarn = storage && storage.pct >= 80;

  return (
    <>
      <Header
        title={ticket.title}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => router.push(`/dashboard/tickets/${boardId}`)} className="btn-secondary text-sm flex items-center gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Voltar ao board
            </button>
            {canEdit && (
              <button onClick={deleteTicket} className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            {saving && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-5xl mx-auto p-6 flex gap-6">

          {/* ── Main column ────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Client card */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                {(ticket.contact_name || '?')[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-400 uppercase tracking-wide mb-0.5">Cliente</p>
                {canEdit ? (
                  <input
                    value={ticket.contact_name || ''}
                    onChange={e => setTicket(p => p ? { ...p, contact_name: e.target.value } : p)}
                    onBlur={() => patch({ contactName: ticket.contact_name } as any)}
                    className="text-sm font-semibold text-indigo-900 bg-transparent border-0 outline-none border-b border-indigo-200 focus:border-indigo-500 w-full"
                  />
                ) : (
                  <p className="text-sm font-semibold text-indigo-900">{ticket.contact_name || '—'}</p>
                )}
                {ticket.created_by_name && (
                  <p className="text-xs text-indigo-400 mt-0.5">Aberto por <span className="font-medium text-indigo-600">{ticket.created_by_name}</span></p>
                )}
              </div>
              {ticket.conversation_id && (
                <a href={`/dashboard/conversations?id=${ticket.conversation_id}`}
                   className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex-shrink-0 bg-white border border-indigo-200 rounded-lg px-3 py-2 transition-colors">
                  <Phone className="w-3.5 h-3.5" />
                  Ver conversa
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            {/* Title */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              {canEdit ? (
                <input
                  value={ticket.title}
                  onChange={e => setTicket(p => p ? { ...p, title: e.target.value } : p)}
                  onBlur={() => patch({ title: ticket.title })}
                  className="w-full text-xl font-semibold text-gray-900 bg-transparent border-0 outline-none border-b-2 border-transparent focus:border-indigo-300 pb-1"
                />
              ) : (
                <h1 className="text-xl font-semibold text-gray-900">{ticket.title}</h1>
              )}
              {/* Description */}
              <div className="mt-3">
                {canEdit ? (
                  <textarea
                    value={ticket.description || ''}
                    onChange={e => setTicket(p => p ? { ...p, description: e.target.value } : p)}
                    onBlur={() => patch({ description: ticket.description })}
                    rows={3}
                    className="w-full text-sm text-gray-600 bg-gray-50 rounded-xl border border-gray-200 p-3 resize-none outline-none focus:ring-2 focus:ring-indigo-200"
                    placeholder="Adicione uma descrição..."
                  />
                ) : (
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{ticket.description || '—'}</p>
                )}
              </div>
            </div>

            {/* Direct attachments */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 text-sm">Arquivos anexados</h3>
                {canEdit && (
                  <>
                    <button onClick={() => fileRef.current?.click()}
                            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                      <Paperclip className="w-3.5 h-3.5" />
                      Anexar arquivo
                    </button>
                    <input ref={fileRef} type="file" className="hidden"
                           onChange={e => { const f = e.target.files?.[0]; if (f) uploadAttachment(f); e.target.value = ''; }} />
                  </>
                )}
              </div>
              {attachments.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum arquivo anexado</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {attachments.map(att => (
                    <div key={att.id}>
                      {isImage(att.mime_type) ? (
                        <div className="group relative rounded-xl overflow-hidden border border-gray-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={att.file_url} alt={att.file_name} className="w-24 h-24 object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-white"><Download className="w-4 h-4" /></a>
                            {canEdit && <button onClick={() => deleteAttachment(att.id)} className="text-white"><X className="w-4 h-4" /></button>}
                          </div>
                        </div>
                      ) : (
                        <AttachmentChip att={att} onDelete={canEdit ? () => deleteAttachment(att.id) : undefined} />
                      )}
                    </div>
                  ))}
                </div>
              )}
              {storageWarn && storage && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                  Armazenamento em {storage.pct}% ({storage.used_mb} MB de {storage.quota_mb} MB)
                </div>
              )}
            </div>

            {/* Comments */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-800 text-sm mb-4">Comentários ({comments.length})</h3>

              <div className="space-y-4 mb-5">
                {comments.map(comment => (
                  <div key={comment.id} className="flex gap-3 group">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold flex-shrink-0">
                      {(comment.user_name || '?')[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-gray-800">{comment.user_name || 'Desconhecido'}</span>
                        <span className="text-xs text-gray-400">
                          {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true, locale: ptBR })}
                        </span>
                        {comment.user_name === user?.name && (
                          <button onClick={() => deleteComment(comment.id)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity ml-auto">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      {comment.content && (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl px-3 py-2">
                          {comment.content}
                        </p>
                      )}
                      {comment.attachments?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {comment.attachments.map(att => (
                            isImage(att.mime_type) ? (
                              <a key={att.id} href={att.file_url} target="_blank" rel="noopener noreferrer"
                                 className="rounded-xl overflow-hidden border border-gray-200 block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={att.file_url} alt={att.file_name} className="w-32 h-32 object-cover hover:opacity-90 transition-opacity" />
                              </a>
                            ) : (
                              <AttachmentChip key={att.id} att={att} />
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Nenhum comentário ainda</p>
                )}
              </div>

              {/* Comment form */}
              <form onSubmit={submitComment} className="border-t border-gray-100 pt-4">
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {(user?.name || '?')[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <textarea
                      value={commentText}
                      onChange={e => setCommentText(e.target.value)}
                      placeholder="Escreva um comentário..."
                      rows={2}
                      className="w-full text-sm bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 resize-none outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300"
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitComment(e as any); } }}
                    />
                    {commentFile && (
                      <div className="flex items-center gap-2 mt-2 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-1.5 text-xs">
                        {fileIcon(commentFile.type)}
                        <span className="font-medium text-indigo-700 truncate max-w-[200px]">{commentFile.name}</span>
                        <span className="text-indigo-400">{formatBytes(commentFile.size)}</span>
                        <button type="button" onClick={() => setCommentFile(null)} className="ml-auto text-indigo-400 hover:text-indigo-600">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      <label className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 cursor-pointer">
                        <Paperclip className="w-3.5 h-3.5" />
                        Anexar arquivo
                        <input type="file" className="hidden"
                               onChange={e => { const f = e.target.files?.[0]; if (f) setCommentFile(f); e.target.value = ''; }} />
                      </label>
                      <button
                        type="submit"
                        disabled={submitting || (!commentText.trim() && !commentFile)}
                        className="flex items-center gap-1.5 btn-primary text-xs py-1.5 px-3"
                      >
                        <Send className="w-3 h-3" />
                        {submitting ? 'Enviando...' : 'Comentar'}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* ── Sidebar ─────────────────────────────────────────────── */}
          <div className="w-72 flex-shrink-0 space-y-4">

            {/* Status / Column */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalhes</h3>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Coluna</label>
                <select value={ticket.column_id} onChange={e => patch({ columnId: e.target.value } as any)} className="input w-full text-sm">
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Prioridade</label>
                <select value={ticket.priority} onChange={e => patch({ priority: e.target.value as TicketPriority })} className="input w-full text-sm">
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Responsável</label>
                <select value={ticket.assignee_id || ''} onChange={e => patch({ assigneeId: e.target.value || null } as any)} className="input w-full text-sm">
                  <option value="">Sem responsável</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Prazo
                </label>
                <input
                  type="datetime-local"
                  value={ticket.due_date ? format(new Date(ticket.due_date), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={e => patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null } as any)}
                  className={clsx('input w-full text-sm', isOverdue && 'border-red-300 text-red-600')}
                />
                {isOverdue && <p className="text-xs text-red-500 mt-1">Prazo vencido</p>}
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1 block">Estimativa (horas)</label>
                <input
                  type="number" min="0" step="0.5"
                  value={ticket.estimated_hours || ''}
                  onChange={e => patch({ estimatedHours: parseFloat(e.target.value) || null } as any)}
                  className="input w-full text-sm"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Labels */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Etiquetas</h3>
              <div className="flex flex-wrap gap-1.5">
                {labels.map(label => {
                  const active = ticket.labels?.some(l => l.id === label.id);
                  return (
                    <button key={label.id}
                            onClick={() => {
                              const newIds = active
                                ? ticket.labels.filter(l => l.id !== label.id).map(l => l.id)
                                : [...ticket.labels.map(l => l.id), label.id];
                              patch({ labelIds: newIds } as any);
                            }}
                            className={clsx('px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                              active ? 'border-transparent text-white' : 'border-gray-200 text-gray-500 bg-white opacity-50 hover:opacity-100'
                            )}
                            style={active ? { backgroundColor: label.color, borderColor: label.color } : {}}>
                      {label.name}
                    </button>
                  );
                })}
                {labels.length === 0 && <p className="text-xs text-gray-400">Sem etiquetas</p>}
              </div>
            </div>

            {/* Timer */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                  <Timer className="w-3.5 h-3.5" /> Tempo
                </h3>
                <span className="text-sm font-mono font-semibold text-gray-700">{formatDuration(ticket.total_time_seconds)}</span>
              </div>
              {timerRunning ? (
                <div className="flex items-center gap-3">
                  <span className="font-mono text-lg font-semibold text-indigo-600">{formatDuration(timerSecs)}</span>
                  <button onClick={stopTimer} className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-700 font-medium ml-auto">
                    <Square className="w-3.5 h-3.5" /> Parar
                  </button>
                </div>
              ) : (
                <button onClick={startTimer} className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-medium">
                  <Play className="w-3.5 h-3.5" /> Iniciar timer
                </button>
              )}
              {timeLogs.length > 0 && (
                <div className="mt-3 space-y-1 border-t border-gray-100 pt-3">
                  {timeLogs.slice(0, 5).map(log => (
                    <div key={log.id} className="flex items-center gap-2 text-xs text-gray-500">
                      <span className="font-mono font-medium">{formatDuration(log.duration_seconds || 0)}</span>
                      <span className="text-gray-300">·</span>
                      <span className="truncate">{log.user_name}</span>
                      <span className="ml-auto text-gray-400">{format(new Date(log.started_at), 'dd/MM', { locale: ptBR })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Storage info */}
            {storage && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Armazenamento</h3>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>{storage.used_mb} MB usados</span>
                  <span>{storage.quota_mb} MB</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className={clsx('h-1.5 rounded-full transition-all', storage.pct >= 90 ? 'bg-red-500' : storage.pct >= 70 ? 'bg-amber-500' : 'bg-indigo-500')}
                    style={{ width: `${Math.min(storage.pct, 100)}%` }}
                  />
                </div>
                {storage.pct >= 80 && (
                  <p className="text-xs text-amber-600 mt-1.5">{storage.pct}% utilizado</p>
                )}
              </div>
            )}

            {/* Created info */}
            <div className="text-xs text-gray-400 space-y-1 px-1">
              <p>Criado {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true, locale: ptBR })}</p>
              {ticket.resolved_at && (
                <p>Resolvido {format(new Date(ticket.resolved_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

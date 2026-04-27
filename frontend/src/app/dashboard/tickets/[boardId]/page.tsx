'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { TicketBoard, TicketColumn, Ticket, TicketBoardMember, TicketLabel, TicketTimeLog, TicketPriority } from '@/types';
import {
  Plus, X, Trash2, Clock, User, Flag, Calendar,
  ChevronRight, Settings, Users, GripVertical,
  Tag, RefreshCw, Timer, Play, Square, Edit3, AlertCircle, Phone,
} from 'lucide-react';
import clsx from 'clsx';
import { format, formatDistanceToNow, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Priority helpers ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Baixa',    color: 'text-gray-500',  bg: 'bg-gray-100'   },
  medium: { label: 'Média',    color: 'text-blue-600',  bg: 'bg-blue-50'    },
  high:   { label: 'Alta',     color: 'text-orange-600',bg: 'bg-orange-50'  },
  urgent: { label: 'Urgente',  color: 'text-red-600',   bg: 'bg-red-50'     },
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Ticket detail modal ───────────────────────────────────────────────────────

interface TicketModalProps {
  ticket: Ticket;
  columns: TicketColumn[];
  members: TicketBoardMember[];
  labels: TicketLabel[];
  workspaceId: string;
  onClose: () => void;
  onUpdated: (t: Ticket) => void;
  onDeleted: (id: string) => void;
  canEdit: boolean;
}

function TicketModal({ ticket, columns, members, labels, workspaceId, onClose, onUpdated, onDeleted, canEdit }: TicketModalProps) {
  const { user } = useAuth();
  const [t, setT] = useState(ticket);
  const [saving, setSaving] = useState(false);
  const [timeLogs, setTimeLogs] = useState<TicketTimeLog[]>([]);
  const [activeTimer, setActiveTimer] = useState<TicketTimeLog | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [showManualTime, setShowManualTime] = useState(false);
  const [manualNote, setManualNote] = useState('');
  const [manualHours, setManualHours] = useState('');
  const [reminderDate, setReminderDate] = useState('');
  const [reminderMsg, setReminderMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadTimeLogs();
  }, []);

  // Timer tick
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  async function loadTimeLogs() {
    const { data } = await api.get<{ logs: TicketTimeLog[]; active: TicketTimeLog | null }>(
      `/workspaces/${workspaceId}/tickets/tickets/${t.id}/time-logs`
    );
    setTimeLogs(data.logs);
    if (data.active) {
      setActiveTimer(data.active);
      const elapsed = Math.floor((Date.now() - new Date(data.active.started_at).getTime()) / 1000);
      setTimerSeconds(elapsed);
      setTimerRunning(true);
    }
  }

  async function patch(fields: Partial<Ticket>) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { data } = await api.put<Ticket>(`/workspaces/${workspaceId}/tickets/tickets/${t.id}`, fields);
      setT(data);
      onUpdated(data);
    } finally { setSaving(false); }
  }

  async function handleStartTimer() {
    const { data } = await api.post<TicketTimeLog>(`/workspaces/${workspaceId}/tickets/tickets/${t.id}/time-logs/start`);
    setActiveTimer(data);
    setTimerSeconds(0);
    setTimerRunning(true);
  }

  async function handleStopTimer() {
    setTimerRunning(false);
    setActiveTimer(null);
    await api.post(`/workspaces/${workspaceId}/tickets/tickets/${t.id}/time-logs/stop`);
    loadTimeLogs();
    const updated = await api.get<Ticket>(`/workspaces/${workspaceId}/tickets/tickets/${t.id}`);
    setT(updated.data);
    onUpdated(updated.data);
  }

  async function handleAddManualTime() {
    const hours = parseFloat(manualHours);
    if (!hours || hours <= 0) return;
    const now = new Date();
    const started = new Date(now.getTime() - hours * 3600000);
    await api.post(`/workspaces/${workspaceId}/tickets/tickets/${t.id}/time-logs`, {
      startedAt: started.toISOString(),
      endedAt: now.toISOString(),
      durationSeconds: Math.round(hours * 3600),
      note: manualNote || null,
    });
    setManualHours('');
    setManualNote('');
    setShowManualTime(false);
    loadTimeLogs();
    const updated = await api.get<Ticket>(`/workspaces/${workspaceId}/tickets/tickets/${t.id}`);
    setT(updated.data);
    onUpdated(updated.data);
  }

  async function handleAddReminder() {
    if (!reminderDate) return;
    await api.post(`/workspaces/${workspaceId}/tickets/tickets/${t.id}/reminders`, {
      remindAt: new Date(reminderDate).toISOString(),
      message: reminderMsg || null,
    });
    setReminderDate('');
    setReminderMsg('');
  }

  const isOverdue = t.due_date && isPast(new Date(t.due_date)) && !t.resolved_at;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            {canEdit ? (
              <input
                value={t.title}
                onChange={e => setT(p => ({ ...p, title: e.target.value }))}
                onBlur={() => patch({ title: t.title })}
                className="w-full text-lg font-semibold text-gray-900 border-0 outline-none bg-transparent"
              />
            ) : (
              <h2 className="text-lg font-semibold text-gray-900 truncate">{t.title}</h2>
            )}
          </div>
          <div className="flex items-center gap-1">
            {saving && <RefreshCw className="w-4 h-4 animate-spin text-gray-400" />}
            {canEdit && (
              <button
                onClick={async () => {
                  if (!confirm('Excluir este ticket?')) return;
                  await api.delete(`/workspaces/${workspaceId}/tickets/tickets/${t.id}`);
                  onDeleted(t.id);
                }}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* ── Client info ─────────────────────────────────────── */}
          <div className="bg-indigo-50 rounded-xl p-3.5 flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-indigo-200 flex items-center justify-center text-indigo-700 font-semibold text-sm flex-shrink-0">
              {(t.contact_name || '?')[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-indigo-500 uppercase tracking-wide mb-0.5">Cliente</div>
              {canEdit ? (
                <input
                  value={t.contact_name || ''}
                  onChange={e => setT(p => ({ ...p, contact_name: e.target.value }))}
                  onBlur={() => patch({ contactName: t.contact_name } as any)}
                  className="w-full text-sm font-semibold text-indigo-900 bg-transparent border-0 outline-none border-b border-indigo-200 focus:border-indigo-500 pb-0.5"
                  placeholder="Nome do cliente"
                />
              ) : (
                <p className="text-sm font-semibold text-indigo-900">{t.contact_name || '—'}</p>
              )}
              {t.created_by_name && (
                <p className="text-xs text-indigo-400 mt-1">Aberto por <span className="font-medium text-indigo-600">{t.created_by_name}</span></p>
              )}
            </div>
            {t.conversation_id && (
              <a
                href={`/dashboard/conversations?id=${t.conversation_id}`}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium flex-shrink-0 mt-0.5"
                title="Abrir conversa"
              >
                <Phone className="w-3.5 h-3.5" />
                Ver conversa
              </a>
            )}
          </div>

          {/* Meta fields */}
          <div className="grid grid-cols-2 gap-4">
            {/* Column */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Coluna</label>
              {canEdit ? (
                <select
                  value={t.column_id}
                  onChange={e => patch({ columnId: e.target.value } as any)}
                  className="input w-full mt-1 text-sm"
                >
                  {columns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-800 mt-1">{columns.find(c => c.id === t.column_id)?.name || '—'}</p>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Prioridade</label>
              {canEdit ? (
                <select
                  value={t.priority}
                  onChange={e => patch({ priority: e.target.value as TicketPriority })}
                  className="input w-full mt-1 text-sm"
                >
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              ) : (
                <span className={clsx('inline-block mt-1 text-xs px-2 py-1 rounded font-medium', PRIORITY_CONFIG[t.priority].bg, PRIORITY_CONFIG[t.priority].color)}>
                  {PRIORITY_CONFIG[t.priority].label}
                </span>
              )}
            </div>

            {/* Assignee */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Responsável</label>
              {canEdit ? (
                <select
                  value={t.assignee_id || ''}
                  onChange={e => patch({ assigneeId: e.target.value || null } as any)}
                  className="input w-full mt-1 text-sm"
                >
                  <option value="">Sem responsável</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
                </select>
              ) : (
                <p className="text-sm text-gray-800 mt-1">{t.assignee_name || '—'}</p>
              )}
            </div>

            {/* Due date */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Prazo</label>
              {canEdit ? (
                <input
                  type="datetime-local"
                  value={t.due_date ? format(new Date(t.due_date), "yyyy-MM-dd'T'HH:mm") : ''}
                  onChange={e => patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null } as any)}
                  className="input w-full mt-1 text-sm"
                />
              ) : (
                <p className={clsx('text-sm mt-1', isOverdue ? 'text-red-600 font-medium' : 'text-gray-800')}>
                  {t.due_date ? format(new Date(t.due_date), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '—'}
                  {isOverdue && ' (atrasado)'}
                </p>
              )}
            </div>

            {/* Estimated hours */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Estimativa (h)</label>
              {canEdit ? (
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={t.estimated_hours || ''}
                  onChange={e => patch({ estimatedHours: parseFloat(e.target.value) || null } as any)}
                  className="input w-full mt-1 text-sm"
                  placeholder="0"
                />
              ) : (
                <p className="text-sm text-gray-800 mt-1">{t.estimated_hours ? `${t.estimated_hours}h` : '—'}</p>
              )}
            </div>

            {/* Total time */}
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tempo registrado</label>
              <p className="text-sm text-gray-800 mt-1 font-mono">{formatDuration(t.total_time_seconds)}</p>
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map(label => {
                const active = t.labels.some(l => l.id === label.id);
                return (
                  <button
                    key={label.id}
                    disabled={!canEdit}
                    onClick={() => {
                      if (!canEdit) return;
                      const newIds = active
                        ? t.labels.filter(l => l.id !== label.id).map(l => l.id)
                        : [...t.labels.map(l => l.id), label.id];
                      patch({ labelIds: newIds } as any);
                    }}
                    className={clsx(
                      'px-2 py-0.5 rounded-full text-xs font-medium border transition-all',
                      active ? 'border-transparent text-white' : 'border-gray-200 text-gray-600 bg-white opacity-50'
                    )}
                    style={active ? { backgroundColor: label.color, borderColor: label.color } : {}}
                  >
                    {label.name}
                  </button>
                );
              })}
              {labels.length === 0 && (
                <span className="text-xs text-gray-400">Sem etiquetas configuradas</span>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-1">Descrição</label>
            {canEdit ? (
              <textarea
                value={t.description || ''}
                onChange={e => setT(p => ({ ...p, description: e.target.value }))}
                onBlur={() => patch({ description: t.description })}
                rows={3}
                className="input w-full text-sm resize-none"
                placeholder="Adicione uma descrição..."
              />
            ) : (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.description || '—'}</p>
            )}
          </div>

          {/* Time tracking */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Controle de Tempo</label>
              {canEdit && (
                <button onClick={() => setShowManualTime(!showManualTime)} className="text-xs text-indigo-600 hover:underline">
                  + Adicionar manual
                </button>
              )}
            </div>

            {/* Timer control */}
            {canEdit && (
              <div className="flex items-center gap-3 mb-3 p-3 bg-gray-50 rounded-lg">
                {timerRunning ? (
                  <>
                    <div className="font-mono text-lg font-medium text-gray-900">
                      {formatDuration(timerSeconds)}
                    </div>
                    <button onClick={handleStopTimer} className="flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700 font-medium">
                      <Square className="w-4 h-4" /> Parar
                    </button>
                  </>
                ) : (
                  <button onClick={handleStartTimer} className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
                    <Play className="w-4 h-4" /> Iniciar timer
                  </button>
                )}
              </div>
            )}

            {/* Manual time form */}
            {showManualTime && (
              <div className="flex gap-2 mb-3 items-end">
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Horas</label>
                  <input type="number" min="0.1" step="0.1" value={manualHours} onChange={e => setManualHours(e.target.value)} className="input w-full text-sm" placeholder="1.5" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Nota</label>
                  <input value={manualNote} onChange={e => setManualNote(e.target.value)} className="input w-full text-sm" placeholder="Opcional" />
                </div>
                <button onClick={handleAddManualTime} className="btn-primary text-sm">OK</button>
              </div>
            )}

            {/* Time log list */}
            {timeLogs.length > 0 && (
              <div className="space-y-1.5">
                {timeLogs.map(log => (
                  <div key={log.id} className="flex items-center gap-2 text-xs text-gray-600">
                    <Timer className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-mono font-medium">{formatDuration(log.duration_seconds || 0)}</span>
                    <span className="text-gray-400">·</span>
                    <span>{log.user_name}</span>
                    {log.note && <span className="text-gray-400 truncate">· {log.note}</span>}
                    <span className="ml-auto text-gray-400">
                      {format(new Date(log.started_at), 'dd/MM HH:mm', { locale: ptBR })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recurring */}
          {canEdit && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Recorrência</label>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={t.is_recurring}
                    onChange={e => patch({ isRecurring: e.target.checked } as any)}
                  />
                  Tarefa recorrente
                </label>
                {t.is_recurring && (
                  <select
                    value={t.recurrence_type || 'weekly'}
                    onChange={e => patch({ recurrenceType: e.target.value } as any)}
                    className="input text-sm"
                  >
                    <option value="daily">Diariamente</option>
                    <option value="weekly">Semanalmente</option>
                    <option value="biweekly">A cada 15 dias</option>
                    <option value="monthly">Mensalmente</option>
                    <option value="yearly">Anualmente</option>
                    <option value="custom">Personalizado</option>
                  </select>
                )}
                {t.is_recurring && t.recurrence_type === 'custom' && (
                  <div className="flex items-center gap-1 text-sm">
                    <span>A cada</span>
                    <input
                      type="number"
                      min="1"
                      value={t.recurrence_interval || 7}
                      onChange={e => patch({ recurrenceInterval: parseInt(e.target.value) } as any)}
                      className="input w-16 text-sm"
                    />
                    <span>dias</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Reminder */}
          {canEdit && (
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Adicionar Lembrete</label>
              <div className="flex gap-2 items-end">
                <div>
                  <label className="text-xs text-gray-500">Data/hora</label>
                  <input type="datetime-local" value={reminderDate} onChange={e => setReminderDate(e.target.value)} className="input text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500">Mensagem (opcional)</label>
                  <input value={reminderMsg} onChange={e => setReminderMsg(e.target.value)} className="input w-full text-sm" placeholder="Lembrar sobre..." />
                </div>
                <button onClick={handleAddReminder} disabled={!reminderDate} className="btn-primary text-sm">
                  Adicionar
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Ticket Card ───────────────────────────────────────────────────────────────

function TicketCard({ ticket, isDragging, onClick }: { ticket: Ticket; isDragging: boolean; onClick: () => void }) {
  const priority = PRIORITY_CONFIG[ticket.priority];
  const isOverdue = ticket.due_date && isPast(new Date(ticket.due_date)) && !ticket.resolved_at;

  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-xl border border-gray-200 p-3 cursor-pointer select-none',
        'hover:shadow-md transition-shadow',
        isDragging && 'shadow-xl rotate-1 border-indigo-300',
      )}
    >
      {/* Labels */}
      {(ticket.labels?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {ticket.labels!.map(l => (
            <span key={l.id} className="text-xs px-1.5 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: l.color }}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      <p className="text-sm font-medium text-gray-900 leading-tight">{ticket.title}</p>

      {ticket.contact_name && (
        <div className="flex items-center gap-1 mt-1.5">
          <Phone className="w-3 h-3 text-indigo-400 flex-shrink-0" />
          <span className="text-xs text-indigo-600 font-medium truncate">{ticket.contact_name}</span>
        </div>
      )}

      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {/* Priority badge */}
        <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', priority.bg, priority.color)}>
          {priority.label}
        </span>

        {/* Due date */}
        {ticket.due_date && (
          <span className={clsx('flex items-center gap-0.5 text-xs', isOverdue ? 'text-red-600 font-medium' : 'text-gray-400')}>
            <Calendar className="w-3 h-3" />
            {format(new Date(ticket.due_date), 'dd/MM', { locale: ptBR })}
          </span>
        )}

        {/* Time */}
        {ticket.total_time_seconds > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {formatDuration(ticket.total_time_seconds)}
          </span>
        )}
      </div>

      {/* Assignee */}
      {ticket.assignee_name && (
        <div className="flex items-center gap-1 mt-2">
          <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-medium flex-shrink-0">
            {ticket.assignee_name[0]?.toUpperCase()}
          </div>
          <span className="text-xs text-gray-500 truncate">{ticket.assignee_name}</span>
        </div>
      )}
    </div>
  );
}

// ── Manage Members modal ──────────────────────────────────────────────────────

function ManageMembersModal({ board, workspaceId, onClose }: { board: TicketBoard; workspaceId: string; onClose: () => void }) {
  const { currentWorkspace } = useAuth();
  const [members, setMembers] = useState<TicketBoardMember[]>([]);
  const [wsMembers, setWsMembers] = useState<Array<{ id: string; name: string; email: string; avatar_url: string | null }>>([]);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState('member');

  useEffect(() => {
    api.get<TicketBoardMember[]>(`/workspaces/${workspaceId}/tickets/boards/${board.id}/members`).then(r => setMembers(r.data)).catch(() => {});
    if (currentWorkspace?.org_id) {
      api.get<typeof wsMembers>(`/orgs/${currentWorkspace.org_id}/workspaces/${workspaceId}/members`).then(r => setWsMembers(r.data)).catch(() => {});
    }
  }, []);

  async function handleAdd() {
    if (!addUserId) return;
    const { data } = await api.post<TicketBoardMember>(`/workspaces/${workspaceId}/tickets/boards/${board.id}/members`, { userId: addUserId, role: addRole });
    setMembers(p => [...p.filter(m => m.user_id !== data.user_id), data]);
    setAddUserId('');
  }

  async function handleRemove(userId: string) {
    await api.delete(`/workspaces/${workspaceId}/tickets/boards/${board.id}/members/${userId}`);
    setMembers(p => p.filter(m => m.user_id !== userId));
  }

  async function handleRoleChange(userId: string, role: string) {
    const { data } = await api.put<TicketBoardMember>(`/workspaces/${workspaceId}/tickets/boards/${board.id}/members/${userId}`, { role });
    setMembers(p => p.map(m => m.user_id === userId ? { ...m, role: data.role } : m));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Membros do Board</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Add member */}
        <div className="flex gap-2 mb-4">
          <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="input flex-1 text-sm">
            <option value="">Selecionar membro...</option>
            {wsMembers.filter(m => !members.find(bm => bm.user_id === m.id)).map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select value={addRole} onChange={e => setAddRole(e.target.value)} className="input text-sm">
            <option value="viewer">Visualizador</option>
            <option value="member">Membro</option>
            <option value="manager">Manager</option>
          </select>
          <button onClick={handleAdd} disabled={!addUserId} className="btn-primary text-sm">Adicionar</button>
        </div>

        {/* Member list */}
        <div className="space-y-2">
          {members.map(m => (
            <div key={m.user_id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-medium flex-shrink-0">
                {m.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                <p className="text-xs text-gray-500 truncate">{m.email}</p>
              </div>
              <select
                value={m.role}
                onChange={e => handleRoleChange(m.user_id, e.target.value)}
                className="input text-xs"
              >
                <option value="viewer">Visualizador</option>
                <option value="member">Membro</option>
                <option value="manager">Manager</option>
              </select>
              <button onClick={() => handleRemove(m.user_id)} className="text-gray-400 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Create ticket form ────────────────────────────────────────────────────────

function QuickCreateTicket({ columnId, boardId, workspaceId, onCreated, onClose }: {
  columnId: string; boardId: string; workspaceId: string;
  onCreated: (t: Ticket) => void; onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post<Ticket>(`/workspaces/${workspaceId}/tickets/boards/${boardId}/tickets`, { columnId, title: title.trim() });
      onCreated(data);
    } finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-indigo-300 p-2 shadow-sm">
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Título do ticket..."
        className="w-full text-sm border-0 outline-none bg-transparent"
        autoFocus
        onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
      />
      <div className="flex justify-end gap-1 mt-2">
        <button type="button" onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">Cancelar</button>
        <button type="submit" disabled={loading || !title.trim()} className="btn-primary text-xs py-1 px-3">
          {loading ? '...' : 'Criar'}
        </button>
      </div>
    </form>
  );
}

// ── Main Board Page ───────────────────────────────────────────────────────────

export default function BoardPage() {
  const params = useParams();
  const router = useRouter();
  const { currentWorkspace, user } = useAuth();
  const boardId = params.boardId as string;

  const [board, setBoard] = useState<TicketBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [members, setMembers] = useState<TicketBoardMember[]>([]);
  const [labels, setLabels] = useState<TicketLabel[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [creatingInColumn, setCreatingInColumn] = useState<string | null>(null);

  const canEdit = (() => {
    if (!board) return false;
    if (!board.user_role) return true; // workspace admin
    return ['member', 'manager'].includes(board.user_role);
  })();

  const isManager = (() => {
    if (!board) return false;
    if (!board.user_role) return true;
    return board.user_role === 'manager';
  })();

  useEffect(() => {
    if (!currentWorkspace) return;
    loadBoard();
    api.get<TicketLabel[]>(`/workspaces/${currentWorkspace.id}/tickets/labels`).then(r => setLabels(r.data)).catch(() => {});
    api.get<TicketBoardMember[]>(`/workspaces/${currentWorkspace.id}/tickets/boards/${boardId}/members`).then(r => setMembers(r.data)).catch(() => {});
  }, [currentWorkspace, boardId]);

  async function loadBoard() {
    if (!currentWorkspace) return;
    try {
      const { data } = await api.get<TicketBoard>(`/workspaces/${currentWorkspace.id}/tickets/boards/${boardId}`);
      setBoard(data);
    } catch {
      setError('Erro ao carregar board');
    } finally { setLoading(false); }
  }

  async function onDragEnd(result: DropResult) {
    if (!board || !canEdit) return;
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newBoard = { ...board, columns: board.columns.map(c => ({ ...c, tickets: [...c.tickets] })) };
    const srcCol = newBoard.columns.find(c => c.id === source.droppableId)!;
    const dstCol = newBoard.columns.find(c => c.id === destination.droppableId)!;
    const [moved] = srcCol.tickets.splice(source.index, 1);
    dstCol.tickets.splice(destination.index, 0, { ...moved, column_id: dstCol.id });
    setBoard(newBoard);

    await api.put(`/workspaces/${currentWorkspace!.id}/tickets/tickets/${draggableId}`, {
      columnId: destination.droppableId,
      position: destination.index,
    }).catch(() => loadBoard()); // revert on error
  }

  function handleTicketUpdated(updated: Ticket) {
    if (!board) return;
    setBoard(prev => {
      if (!prev) return prev;
      const cols = prev.columns.map(col => ({
        ...col,
        tickets: col.tickets.map(t => t.id === updated.id ? { ...updated, column_id: col.id } : t),
      }));
      // Move to correct column if column_id changed
      const sourceCol = cols.find(c => c.tickets.some(t => t.id === updated.id));
      if (sourceCol && sourceCol.id !== updated.column_id) {
        const ticket = sourceCol.tickets.find(t => t.id === updated.id)!;
        sourceCol.tickets = sourceCol.tickets.filter(t => t.id !== updated.id);
        const dstCol = cols.find(c => c.id === updated.column_id);
        if (dstCol) dstCol.tickets.push({ ...ticket, ...updated });
      }
      return { ...prev, columns: cols };
    });
    if (selectedTicket?.id === updated.id) setSelectedTicket(updated);
  }

  function handleTicketDeleted(id: string) {
    setBoard(prev => prev ? {
      ...prev,
      columns: prev.columns.map(col => ({ ...col, tickets: col.tickets.filter(t => t.id !== id) })),
    } : prev);
    setSelectedTicket(null);
  }

  function handleTicketCreated(ticket: Ticket) {
    setBoard(prev => prev ? {
      ...prev,
      columns: prev.columns.map(col =>
        col.id === ticket.column_id ? { ...col, tickets: [...col.tickets, ticket] } : col
      ),
    } : prev);
    setCreatingInColumn(null);
  }

  if (!currentWorkspace) return null;

  if (loading) {
    return (
      <>
        <Header title="Carregando..." />
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </>
    );
  }

  if (error || !board) {
    return (
      <>
        <Header title="Board" />
        <div className="flex-1 flex items-center justify-center text-red-500 gap-2">
          <AlertCircle className="w-5 h-5" />
          {error || 'Board não encontrado'}
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={board.name}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard/tickets')} className="btn-secondary text-sm">
              ← Boards
            </button>
            {isManager && (
              <button onClick={() => setShowMembers(true)} className="btn-secondary text-sm flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Membros
              </button>
            )}
            <button onClick={loadBoard} className="btn-secondary text-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-x-auto p-6 bg-gray-50">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 items-start pb-4">
            {board.columns.map(col => (
              <div key={col.id} className="w-72 flex-shrink-0 flex flex-col">
                {/* Column header */}
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: col.color }} />
                  <h3 className="font-semibold text-gray-800 text-sm flex-1 truncate">{col.name}</h3>
                  {col.is_done && (
                    <span className="text-xs text-green-600 font-medium bg-green-50 px-1.5 rounded">Concluído</span>
                  )}
                  <span className="text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-full px-1.5 py-0.5">
                    {col.tickets.length}
                  </span>
                </div>

                {/* Droppable */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={clsx(
                        'rounded-xl p-2 space-y-2 min-h-24 transition-colors',
                        snapshot.isDraggingOver ? 'bg-indigo-50 border-2 border-dashed border-indigo-300' : 'bg-gray-100'
                      )}
                    >
                      {col.tickets.length === 0 && !snapshot.isDraggingOver && creatingInColumn !== col.id && (
                        <div className="text-xs text-gray-400 text-center py-3">Nenhum ticket</div>
                      )}

                      {col.tickets.map((ticket, index) => (
                        <Draggable key={ticket.id} draggableId={ticket.id} index={index} isDragDisabled={!canEdit}>
                          {(prov, snap) => (
                            <div ref={prov.innerRef} {...prov.draggableProps} {...prov.dragHandleProps}>
                              <TicketCard
                                ticket={ticket}
                                isDragging={snap.isDragging}
                                onClick={() => setSelectedTicket(ticket)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}

                      {/* Quick create */}
                      {creatingInColumn === col.id && (
                        <QuickCreateTicket
                          columnId={col.id}
                          boardId={board.id}
                          workspaceId={currentWorkspace.id}
                          onCreated={handleTicketCreated}
                          onClose={() => setCreatingInColumn(null)}
                        />
                      )}
                    </div>
                  )}
                </Droppable>

                {/* Add ticket button */}
                {canEdit && creatingInColumn !== col.id && (
                  <button
                    onClick={() => setCreatingInColumn(col.id)}
                    className="mt-2 flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 px-3 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Adicionar ticket
                  </button>
                )}
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>

      {/* Ticket detail modal */}
      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          columns={board.columns}
          members={members}
          labels={labels}
          workspaceId={currentWorkspace.id}
          onClose={() => setSelectedTicket(null)}
          onUpdated={handleTicketUpdated}
          onDeleted={handleTicketDeleted}
          canEdit={canEdit}
        />
      )}

      {/* Manage members modal */}
      {showMembers && (
        <ManageMembersModal
          board={board}
          workspaceId={currentWorkspace.id}
          onClose={() => setShowMembers(false)}
        />
      )}
    </>
  );
}

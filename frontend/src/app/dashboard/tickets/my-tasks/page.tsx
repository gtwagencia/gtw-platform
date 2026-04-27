'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Ticket, TicketPriority } from '@/types';
import {
  Calendar, Clock, Flag, CheckCircle, Circle,
  ArrowUpRight, RefreshCw, Inbox,
} from 'lucide-react';
import clsx from 'clsx';
import { format, isPast, isToday, isTomorrow, startOfToday } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PRIORITY_CONFIG: Record<TicketPriority, { label: string; color: string; bg: string }> = {
  low:    { label: 'Baixa',   color: 'text-gray-500',   bg: 'bg-gray-100'  },
  medium: { label: 'Média',   color: 'text-blue-600',   bg: 'bg-blue-50'   },
  high:   { label: 'Alta',    color: 'text-orange-600', bg: 'bg-orange-50' },
  urgent: { label: 'Urgente', color: 'text-red-600',    bg: 'bg-red-50'    },
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}min`;
}

function getDueDateLabel(dateStr: string | null): { label: string; color: string } | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isToday(d))    return { label: 'Hoje',   color: 'text-orange-600' };
  if (isTomorrow(d)) return { label: 'Amanhã', color: 'text-yellow-600' };
  if (isPast(d))     return { label: `Atrasado · ${format(d, 'dd/MM', { locale: ptBR })}`, color: 'text-red-600' };
  return { label: format(d, 'dd/MM', { locale: ptBR }), color: 'text-gray-500' };
}

function groupTickets(tickets: Ticket[]) {
  const overdue:  Ticket[] = [];
  const today:    Ticket[] = [];
  const upcoming: Ticket[] = [];
  const noDue:    Ticket[] = [];

  for (const t of tickets) {
    if (t.resolved_at) continue;
    if (!t.due_date) {
      noDue.push(t);
    } else {
      const d = new Date(t.due_date);
      if (isPast(d) && !isToday(d)) overdue.push(t);
      else if (isToday(d))          today.push(t);
      else                          upcoming.push(t);
    }
  }
  return { overdue, today, upcoming, noDue };
}

export default function MyTasksPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuth();

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'open' | 'done' | ''>('open');

  useEffect(() => {
    if (!currentWorkspace) return;
    loadTasks();
  }, [currentWorkspace, statusFilter]);

  async function loadTasks() {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get<Ticket[]>(`/workspaces/${currentWorkspace.id}/tickets/my-tasks`, {
        params: { status: statusFilter || undefined },
      });
      setTickets(data);
    } finally {
      setLoading(false);
    }
  }

  const groups = groupTickets(tickets);
  const doneTickets = tickets.filter(t => !!t.resolved_at);

  function TicketRow({ ticket }: { ticket: Ticket }) {
    const due = getDueDateLabel(ticket.due_date);
    const priority = PRIORITY_CONFIG[ticket.priority];
    const isDone = !!ticket.resolved_at;

    return (
      <div className={clsx(
        'bg-white rounded-xl border border-gray-100 p-4 flex items-start gap-3 hover:shadow-sm transition-shadow',
        isDone && 'opacity-60'
      )}>
        {/* Done circle */}
        <div className="flex-shrink-0 mt-0.5">
          {isDone
            ? <CheckCircle className="w-5 h-5 text-green-500" />
            : <Circle className="w-5 h-5 text-gray-300" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className={clsx('text-sm font-medium flex-1', isDone ? 'line-through text-gray-400' : 'text-gray-900')}>
              {ticket.title}
            </p>
            <button
              onClick={() => router.push(`/dashboard/tickets/${ticket.board_id}`)}
              title="Abrir board"
              className="text-gray-400 hover:text-indigo-600 flex-shrink-0"
            >
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>

          {/* Board + column */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {ticket.board_color && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: ticket.board_color }} />
                {ticket.board_name}
              </span>
            )}
            {ticket.column_name && (
              <span className="text-xs text-gray-400">· {ticket.column_name}</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {/* Priority */}
            <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', priority.bg, priority.color)}>
              {priority.label}
            </span>

            {/* Due date */}
            {due && (
              <span className={clsx('flex items-center gap-0.5 text-xs font-medium', due.color)}>
                <Calendar className="w-3 h-3" />
                {due.label}
              </span>
            )}

            {/* Time */}
            {ticket.total_time_seconds > 0 && (
              <span className="flex items-center gap-0.5 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                {formatDuration(ticket.total_time_seconds)}
                {ticket.estimated_hours && (
                  <span className="text-gray-300 ml-0.5">/ {ticket.estimated_hours}h</span>
                )}
              </span>
            )}

            {/* Labels */}
            {(ticket.labels ?? []).map(l => (
              <span key={l.id} className="text-xs px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: l.color }}>
                {l.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  function Section({ title, color, items }: { title: string; color: string; items: Ticket[] }) {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <div className={clsx('flex items-center gap-2 mb-3')}>
          <h3 className={clsx('text-sm font-semibold', color)}>{title}</h3>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{items.length}</span>
        </div>
        <div className="space-y-2">
          {items.map(t => <TicketRow key={t.id} ticket={t} />)}
        </div>
      </div>
    );
  }

  if (!currentWorkspace) return null;

  const total = tickets.filter(t => !t.resolved_at).length;

  return (
    <>
      <Header
        title="Minhas Tarefas"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard/tickets')} className="btn-secondary text-sm">
              ← Boards
            </button>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['open', 'Em aberto'], ['', 'Todas'], ['done', 'Concluídas']].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val as any)}
                  className={clsx(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    statusFilter === val ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button onClick={loadTasks} className="btn-secondary text-sm">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="bg-gray-200 rounded-xl h-20 animate-pulse" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
            <Inbox className="w-12 h-12 text-gray-300" />
            <p className="font-medium text-gray-500">Nenhuma tarefa atribuída a você</p>
          </div>
        ) : statusFilter === 'done' ? (
          <div className="space-y-2">
            {doneTickets.map(t => <TicketRow key={t.id} ticket={t} />)}
          </div>
        ) : (
          <>
            <Section title="Atrasadas" color="text-red-600" items={groups.overdue} />
            <Section title="Para hoje" color="text-orange-600" items={groups.today} />
            <Section title="Próximas" color="text-gray-700" items={groups.upcoming} />
            <Section title="Sem prazo" color="text-gray-500" items={groups.noDue} />

            {total === 0 && (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                <CheckCircle className="w-12 h-12 text-green-400" />
                <p className="font-medium text-gray-600">Tudo em dia! Nenhuma tarefa em aberto.</p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Ticket, TicketPriority } from '@/types';
import {
  ChevronLeft, ChevronRight, RefreshCw, Calendar as CalendarIcon,
} from 'lucide-react';
import clsx from 'clsx';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday, isPast,
  addMonths, subMonths, isSameDay, startOfDay, endOfDay,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low:    'bg-gray-200 text-gray-700',
  medium: 'bg-blue-100 text-blue-700',
  high:   'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function TicketCalendarPage() {
  const router = useRouter();
  const { currentWorkspace } = useAuth();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [myOnly, setMyOnly] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const loadTickets = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
      const end   = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
      const { data } = await api.get<Ticket[]>(`/workspaces/${currentWorkspace.id}/tickets/calendar`, {
        params: {
          from: start.toISOString(),
          to:   end.toISOString(),
          myOnly: myOnly ? 'true' : 'false',
        },
      });
      setTickets(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, currentDate, myOnly]);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd   = endOfMonth(currentDate);
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calEnd     = endOfWeek(monthEnd,   { weekStartsOn: 0 });
  const days       = eachDayOfInterval({ start: calStart, end: calEnd });

  function ticketsForDay(day: Date) {
    return tickets.filter(t => t.due_date && isSameDay(new Date(t.due_date), day));
  }

  const selectedDayTickets = selectedDay ? ticketsForDay(selectedDay) : [];
  const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  if (!currentWorkspace) return null;

  return (
    <>
      <Header
        title="Calendário de Tickets"
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/dashboard/tickets')} className="btn-secondary text-sm">
              ← Boards
            </button>
            <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
              <input type="checkbox" checked={myOnly} onChange={e => setMyOnly(e.target.checked)} className="rounded" />
              Somente minhas tarefas
            </label>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="btn-secondary p-2">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setCurrentDate(new Date())} className="btn-secondary text-sm px-3">
                Hoje
              </button>
              <button onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="btn-secondary p-2">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <span className="text-sm font-medium text-gray-700 capitalize">
              {format(currentDate, 'MMMM yyyy', { locale: ptBR })}
            </span>
            <button onClick={loadTickets} className="btn-secondary text-sm">
              <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEKDAYS.map(d => (
              <div key={d} className="py-2 text-center text-xs font-medium text-gray-500">{d}</div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const dayTickets = ticketsForDay(day);
              const isCurrentMonth = isSameMonth(day, currentDate);
              const isSelected = selectedDay && isSameDay(day, selectedDay);

              return (
                <div
                  key={idx}
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={clsx(
                    'min-h-24 p-1.5 border-b border-r border-gray-100 cursor-pointer transition-colors',
                    !isCurrentMonth && 'bg-gray-50',
                    isSelected && 'bg-indigo-50',
                    isToday(day) && 'bg-blue-50',
                    'hover:bg-gray-50'
                  )}
                >
                  {/* Day number */}
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium mb-1 mx-auto',
                    isToday(day) ? 'bg-indigo-600 text-white' : isCurrentMonth ? 'text-gray-800' : 'text-gray-400'
                  )}>
                    {format(day, 'd')}
                  </div>

                  {/* Tickets */}
                  <div className="space-y-0.5">
                    {dayTickets.slice(0, 3).map(t => (
                      <div
                        key={t.id}
                        className={clsx(
                          'text-xs px-1.5 py-0.5 rounded truncate font-medium cursor-pointer hover:opacity-80',
                          PRIORITY_COLORS[t.priority],
                          t.resolved_at && 'line-through opacity-50'
                        )}
                        onClick={e => { e.stopPropagation(); router.push(`/dashboard/tickets/${t.board_id}`); }}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                    ))}
                    {dayTickets.length > 3 && (
                      <div className="text-xs text-gray-400 px-1.5">+{dayTickets.length - 3} mais</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected day detail */}
        {selectedDay && selectedDayTickets.length > 0 && (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">
              {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
              <span className="ml-2 text-sm font-normal text-gray-500">({selectedDayTickets.length} tickets)</span>
            </h3>
            <div className="space-y-2">
              {selectedDayTickets.map(t => (
                <div
                  key={t.id}
                  onClick={() => router.push(`/dashboard/tickets/${t.board_id}`)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 cursor-pointer hover:bg-gray-50"
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.board_color || '#6366f1' }} />
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-sm font-medium text-gray-900', t.resolved_at && 'line-through text-gray-400')}>
                      {t.title}
                    </p>
                    <p className="text-xs text-gray-500">{t.board_name} · {t.column_name}</p>
                  </div>
                  {t.assignee_name && (
                    <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-medium flex-shrink-0">
                      {t.assignee_name?.[0]?.toUpperCase()}
                    </div>
                  )}
                  <span className={clsx('text-xs px-1.5 py-0.5 rounded font-medium', PRIORITY_COLORS[t.priority])}>
                    {t.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 flex-wrap text-xs text-gray-500">
          <span className="font-medium">Prioridade:</span>
          {(Object.entries(PRIORITY_COLORS) as [TicketPriority, string][]).map(([k, cls]) => (
            <span key={k} className={clsx('px-2 py-0.5 rounded', cls)}>
              {k === 'low' ? 'Baixa' : k === 'medium' ? 'Média' : k === 'high' ? 'Alta' : 'Urgente'}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

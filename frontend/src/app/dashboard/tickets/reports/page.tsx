'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { TicketBoard } from '@/types';
import { BarChart2, Clock, CheckCircle, Ticket, Download } from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ReportRow {
  user_id: string;
  user_name: string;
  avatar_url: string | null;
  total_tickets: number;
  resolved_tickets: number;
  avg_resolution_hours: number | null;
  total_hours_logged: number;
}

const PRESETS = [
  { label: 'Últimos 7 dias',  days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Este mês',        days: 0 },
  { label: 'Personalizado',   days: -1 },
];

function fmtHours(h: number | null) {
  if (h === null || h === undefined) return '—';
  const n = Number(h);
  if (isNaN(n)) return '—';
  if (n < 1) return `${Math.round(n * 60)}min`;
  return `${n.toFixed(1)}h`;
}

export default function TicketsReportsPage() {
  const { currentWorkspace } = useAuth();

  const [boards,     setBoards]     = useState<TicketBoard[]>([]);
  const [boardId,    setBoardId]    = useState('');
  const [preset,     setPreset]     = useState(1); // 30 days
  const [from,       setFrom]       = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [to,         setTo]         = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rows,       setRows]       = useState<ReportRow[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [fetched,    setFetched]    = useState(false);

  useEffect(() => {
    if (!currentWorkspace) return;
    api.get<TicketBoard[]>(`/workspaces/${currentWorkspace.id}/tickets/boards`)
      .then(({ data }) => setBoards(data))
      .catch(() => {});
  }, [currentWorkspace]);

  function applyPreset(idx: number) {
    setPreset(idx);
    const today = new Date();
    if (idx === 0) {
      setFrom(format(subDays(today, 7), 'yyyy-MM-dd'));
      setTo(format(today, 'yyyy-MM-dd'));
    } else if (idx === 1) {
      setFrom(format(subDays(today, 30), 'yyyy-MM-dd'));
      setTo(format(today, 'yyyy-MM-dd'));
    } else if (idx === 2) {
      setFrom(format(startOfMonth(today), 'yyyy-MM-dd'));
      setTo(format(today, 'yyyy-MM-dd'));
    }
    // idx === 3: custom — user edits inputs directly
  }

  async function fetchReport() {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const params: Record<string, string> = { from, to };
      if (boardId) params.boardId = boardId;
      const { data } = await api.get<ReportRow[]>(
        `/workspaces/${currentWorkspace.id}/tickets/reports`,
        { params }
      );
      setRows(data);
      setFetched(true);
    } catch {
      alert('Erro ao carregar relatório.');
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    if (!rows.length) return;
    const header = ['Agente', 'Total', 'Resolvidos', 'Taxa (%)', 'Tempo médio', 'Horas registradas'];
    const csvRows = rows.map(r => [
      r.user_name,
      r.total_tickets,
      r.resolved_tickets,
      r.total_tickets > 0 ? ((r.resolved_tickets / r.total_tickets) * 100).toFixed(1) : '0',
      fmtHours(r.avg_resolution_hours),
      fmtHours(r.total_hours_logged),
    ]);
    const csv = [header, ...csvRows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tickets-relatorio-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Summary totals
  const totals = rows.reduce(
    (acc, r) => ({
      total:    acc.total    + r.total_tickets,
      resolved: acc.resolved + r.resolved_tickets,
      hours:    acc.hours    + Number(r.total_hours_logged || 0),
    }),
    { total: 0, resolved: 0, hours: 0 }
  );

  const resolutionRate = totals.total > 0
    ? ((totals.resolved / totals.total) * 100).toFixed(1)
    : '0';

  return (
    <>
      <Header title="Relatório de Tickets" />

      <div className="flex-1 overflow-auto p-6 bg-gray-50">

        {/* ── Filters ──────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Filtros</h2>
          <div className="flex flex-wrap gap-4 items-end">

            {/* Period presets */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Período</label>
              <div className="flex gap-1.5 flex-wrap">
                {PRESETS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => applyPreset(i)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      preset === i
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date range */}
            <div className="flex gap-2 items-end">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">De</label>
                <input
                  type="date"
                  value={from}
                  onChange={e => { setFrom(e.target.value); setPreset(3); }}
                  className="input text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Até</label>
                <input
                  type="date"
                  value={to}
                  onChange={e => { setTo(e.target.value); setPreset(3); }}
                  className="input text-sm"
                />
              </div>
            </div>

            {/* Board filter */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Board</label>
              <select
                value={boardId}
                onChange={e => setBoardId(e.target.value)}
                className="input text-sm"
              >
                <option value="">Todos os boards</option>
                {boards.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={fetchReport}
              disabled={loading}
              className="btn-primary text-sm flex items-center gap-2"
            >
              <BarChart2 className="w-4 h-4" />
              {loading ? 'Carregando...' : 'Gerar relatório'}
            </button>
          </div>
        </div>

        {/* ── Summary cards ─────────────────────────────────────── */}
        {fetched && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <Ticket className="w-5 h-5 text-indigo-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Total de Tickets</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{totals.total}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {format(new Date(from + 'T12:00:00'), "d 'de' MMM", { locale: ptBR })} –{' '}
                  {format(new Date(to + 'T12:00:00'), "d 'de' MMM", { locale: ptBR })}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-green-50 rounded-xl flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Resolvidos</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{totals.resolved}</p>
                <p className="text-xs text-gray-400 mt-1">Taxa de resolução: <strong className="text-green-600">{resolutionRate}%</strong></p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-600">Horas Registradas</span>
                </div>
                <p className="text-3xl font-bold text-gray-900">{fmtHours(totals.hours)}</p>
                <p className="text-xs text-gray-400 mt-1">Total no período</p>
              </div>
            </div>

            {/* ── Table ─────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900 text-sm">Por agente</h2>
                {rows.length > 0 && (
                  <button
                    onClick={exportCsv}
                    className="btn-secondary text-xs flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Exportar CSV
                  </button>
                )}
              </div>

              {rows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                  <BarChart2 className="w-10 h-10 text-gray-200" />
                  <p className="text-gray-500 text-sm">Nenhum dado no período selecionado.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-5 py-3 font-medium">Agente</th>
                        <th className="text-right px-5 py-3 font-medium">Total</th>
                        <th className="text-right px-5 py-3 font-medium">Resolvidos</th>
                        <th className="text-right px-5 py-3 font-medium">Taxa</th>
                        <th className="text-right px-5 py-3 font-medium">Tempo médio</th>
                        <th className="text-right px-5 py-3 font-medium">Horas registradas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {rows.map(r => {
                        const rate = r.total_tickets > 0
                          ? ((r.resolved_tickets / r.total_tickets) * 100)
                          : 0;
                        return (
                          <tr key={r.user_id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold flex-shrink-0">
                                  {r.user_name[0]?.toUpperCase()}
                                </div>
                                <span className="font-medium text-gray-900">{r.user_name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-right text-gray-700 font-medium">{r.total_tickets}</td>
                            <td className="px-5 py-3.5 text-right text-green-600 font-medium">{r.resolved_tickets}</td>
                            <td className="px-5 py-3.5 text-right">
                              <span className={`inline-flex items-center justify-end gap-1 font-medium ${
                                rate >= 75 ? 'text-green-600' : rate >= 50 ? 'text-yellow-600' : 'text-red-500'
                              }`}>
                                {rate.toFixed(1)}%
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-right text-gray-600">{fmtHours(r.avg_resolution_hours)}</td>
                            <td className="px-5 py-3.5 text-right text-blue-600 font-medium">{fmtHours(r.total_hours_logged)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!fetched && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <BarChart2 className="w-12 h-12 text-gray-200" />
            <p className="text-gray-500">Selecione o período e clique em <strong>Gerar relatório</strong>.</p>
          </div>
        )}

      </div>
    </>
  );
}

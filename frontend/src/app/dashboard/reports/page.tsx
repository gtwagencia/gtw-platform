'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { AgentReport, VolumeByDay } from '@/types';
import { MessageSquare, CheckCircle, Clock, Star, AlertTriangle, Download } from 'lucide-react';

function formatSeconds(secs: number | null) {
  if (!secs) return '—';
  if (secs < 60)   return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}min`;
  return `${(secs / 3600).toFixed(1)}h`;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

interface Summary {
  total_conversations: string;
  resolved: string;
  open: string;
  pending: string;
  avg_response_time_seconds: string | null;
  sla_breached_count: string;
  avg_csat: string | null;
  total_messages: string;
}

export default function ReportsPage() {
  const { currentWorkspace } = useAuth();
  const [summary,  setSummary]  = useState<Summary | null>(null);
  const [agents,   setAgents]   = useState<AgentReport[]>([]);
  const [volume,   setVolume]   = useState<VolumeByDay[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [days,     setDays]     = useState(30);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const endDate   = new Date().toISOString();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const params    = { startDate, endDate };

    try {
      const [s, a, v] = await Promise.all([
        api.get(`/workspaces/${currentWorkspace.id}/reports/summary`, { params }),
        api.get(`/workspaces/${currentWorkspace.id}/reports/agents`,  { params }),
        api.get(`/workspaces/${currentWorkspace.id}/reports/volume`,  { params }),
      ]);
      setSummary(s.data);
      setAgents(a.data);
      setVolume(v.data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, days]);

  useEffect(() => { load(); }, [load]);

  function exportCsv() {
    if (!summary || !agents.length) return;

    const rows: string[][] = [
      ['# Relatório GTW Platform', `Período: últimos ${days} dias`, `Gerado: ${new Date().toLocaleDateString('pt-BR')}`],
      [],
      ['RESUMO'],
      ['Total de conversas', summary.total_conversations],
      ['Resolvidas', summary.resolved],
      ['Abertas', summary.open],
      ['Pendentes', summary.pending],
      ['Total de mensagens', summary.total_messages],
      ['Tempo médio de resposta (s)', summary.avg_response_time_seconds ?? ''],
      ['CSAT médio', summary.avg_csat ?? ''],
      ['SLA excedido', summary.sla_breached_count],
      [],
      ['AGENTES', 'Conversas', 'Resolvidas', 'Tempo resposta (s)', 'CSAT', 'Mensagens enviadas'],
      ...agents.map(a => [
        a.name,
        String(a.total_conversations),
        String(a.resolved),
        String(a.avg_response_time_seconds ?? ''),
        String(a.avg_csat ? parseFloat(String(a.avg_csat)).toFixed(2) : ''),
        String(a.messages_sent),
      ]),
      [],
      ['VOLUME POR DIA', 'Conversas'],
      ...volume.map(v => [v.date, String(v.total)]),
    ];

    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `relatorio-gtw-${days}d-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Relatórios" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  const maxVol = Math.max(...volume.map(v => v.total), 1);

  return (
    <>
      <Header
        title="Relatórios"
        actions={
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  days === d ? 'bg-brand-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {d}d
              </button>
            ))}
            <button
              onClick={exportCsv}
              disabled={loading || !summary}
              className="btn-secondary text-sm flex items-center gap-1.5"
              title="Exportar CSV"
            >
              <Download className="w-4 h-4" />
              CSV
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MessageSquare className="w-4 h-4 text-brand-600" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{summary.total_conversations}</div>
                  <div className="text-xs text-gray-400 mt-1">{summary.total_messages} mensagens</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Resolvidas</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">{summary.resolved}</div>
                  <div className="text-xs text-gray-400 mt-1">
                    {summary.total_conversations > 0
                      ? Math.round((parseInt(summary.resolved) / parseInt(summary.total_conversations)) * 100)
                      : 0}% do total
                  </div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-blue-500" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tempo médio</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatSeconds(summary.avg_response_time_seconds ? parseFloat(summary.avg_response_time_seconds) : null)}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">primeira resposta</div>
                </div>

                <div className="card p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">CSAT médio</span>
                  </div>
                  <div className="text-2xl font-bold text-gray-900">
                    {summary.avg_csat ? parseFloat(summary.avg_csat).toFixed(1) : '—'}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    {parseInt(summary.sla_breached_count) > 0 && (
                      <span className="text-xs text-red-500 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" />
                        {summary.sla_breached_count} SLA
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Volume chart */}
            {volume.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Volume de conversas</h2>
                <div className="flex items-end gap-1 h-32">
                  {volume.map(v => (
                    <div key={v.date} className="flex-1 flex flex-col items-center gap-0.5 group">
                      <div
                        className="w-full bg-brand-500 rounded-t-sm transition-all group-hover:bg-brand-600"
                        style={{ height: `${Math.round((v.total / maxVol) * 100)}%`, minHeight: v.total ? 4 : 0 }}
                        title={`${formatDate(v.date)}: ${v.total} conversas`}
                      />
                      {volume.length <= 14 && (
                        <span className="text-xs text-gray-400 hidden group-hover:block absolute -bottom-5 whitespace-nowrap">
                          {formatDate(v.date)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>{volume.length > 0 ? formatDate(volume[0].date) : ''}</span>
                  <span>{volume.length > 0 ? formatDate(volume[volume.length - 1].date) : ''}</span>
                </div>
              </div>
            )}

            {/* Agent leaderboard */}
            {agents.length > 0 && (
              <div className="card p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Performance por agente</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b border-gray-100">
                        <th className="text-left pb-2 font-medium">Agente</th>
                        <th className="text-right pb-2 font-medium">Conversas</th>
                        <th className="text-right pb-2 font-medium">Resolvidas</th>
                        <th className="text-right pb-2 font-medium">Tempo resposta</th>
                        <th className="text-right pb-2 font-medium">CSAT</th>
                        <th className="text-right pb-2 font-medium">Mensagens</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {agents.map(agent => (
                        <tr key={agent.id} className="hover:bg-gray-50">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-semibold flex-shrink-0">
                                {agent.name[0]?.toUpperCase()}
                              </div>
                              <span className="font-medium text-gray-900 truncate max-w-32">{agent.name}</span>
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-gray-700">{agent.total_conversations}</td>
                          <td className="py-2.5 text-right">
                            <span className="text-green-600 font-medium">{agent.resolved}</span>
                          </td>
                          <td className="py-2.5 text-right text-gray-600">
                            {formatSeconds(agent.avg_response_time_seconds)}
                          </td>
                          <td className="py-2.5 text-right">
                            {agent.avg_csat ? (
                              <span className="flex items-center justify-end gap-1">
                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                {parseFloat(String(agent.avg_csat)).toFixed(1)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="py-2.5 text-right text-gray-600">{agent.messages_sent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

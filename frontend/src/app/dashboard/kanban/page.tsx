'use client';

import { useState, useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { KanbanStage, Deal } from '@/types';
import {
  GripVertical, MessageSquare, Clock, User, Brain,
  RefreshCw, AlertCircle, ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatResponseTime(seconds: number | null): string {
  if (seconds === null) return '—';
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function responseTimeColor(seconds: number | null): string {
  if (seconds === null) return 'text-gray-400';
  if (seconds < 300)   return 'text-green-600';   // < 5min
  if (seconds < 1800)  return 'text-yellow-600';  // < 30min
  return 'text-red-600';
}

function aiQualificationColor(qual: string | null): string {
  const map: Record<string, string> = {
    'Novo Lead':              'bg-indigo-100 text-indigo-700',
    'Em Atendimento':         'bg-orange-100 text-orange-700',
    'Qualificado para Venda': 'bg-yellow-100 text-yellow-700',
    'Comprou':                'bg-green-100 text-green-700',
    'Negócio Perdido':        'bg-red-100 text-red-700',
  };
  return qual ? (map[qual] || 'bg-gray-100 text-gray-600') : '';
}

// ── Deal Card ────────────────────────────────────────────────────────────────

interface DealCardProps {
  deal: Deal;
  dragHandleProps: object;
  isDragging: boolean;
  onAnalyze: (dealId: string) => void;
  analyzing: boolean;
  workspaceId: string;
}

function DealCard({ deal, dragHandleProps, isDragging, onAnalyze, analyzing, workspaceId }: DealCardProps) {
  const router = useRouter();

  const hasUnread   = (deal.unread_count ?? 0) > 0;
  // "Aguardando" só aparece quando o cliente enviou e ainda não foi respondido
  const isWaiting   = hasUnread && deal.last_inbound_at && !deal.conv_status?.includes('resolved');
  const waitingTime = deal.last_inbound_at
    ? formatDistanceToNow(new Date(deal.last_inbound_at), { locale: ptBR, addSuffix: false })
    : null;

  return (
    <div className={clsx(
      'bg-white rounded-xl border border-gray-200 p-3 select-none',
      'transition-shadow hover:shadow-md',
      isDragging && 'shadow-xl rotate-1 border-brand-300',
      hasUnread && 'border-l-4 border-l-brand-500'
    )}>
      {/* Drag handle + title */}
      <div className="flex items-start gap-2">
        <div {...dragHandleProps} className="mt-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0">
          <GripVertical className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 text-sm leading-tight truncate">{deal.title}</div>

          {/* Contact */}
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{deal.contact_name}</span>
            {deal.contact_phone && (
              <span className="text-gray-400 truncate">· {deal.contact_phone}</span>
            )}
          </div>

          {/* Response time */}
          {deal.response_time_seconds !== null && (
            <div className={clsx(
              'flex items-center gap-1 mt-1 text-xs font-medium',
              responseTimeColor(deal.response_time_seconds)
            )}>
              <Clock className="w-3 h-3 flex-shrink-0" />
              1ª resposta: {formatResponseTime(deal.response_time_seconds)}
            </div>
          )}

          {/* Waiting for reply indicator */}
          {isWaiting && waitingTime && (
            <div className="flex items-center gap-1 mt-1 text-xs text-orange-600">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              Aguardando há {waitingTime}
            </div>
          )}

          {/* AI status */}
          <div className="mt-2">
            {deal.ai_qualification ? (
              <span className={clsx(
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium',
                aiQualificationColor(deal.ai_qualification)
              )}>
                <Brain className="w-2.5 h-2.5" />
                {deal.ai_qualification}
              </span>
            ) : deal.ai_analyzed_at ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">
                <Brain className="w-2.5 h-2.5" />
                IA sem classificação
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-50 text-gray-300">
                <Brain className="w-2.5 h-2.5" />
                IA pendente
              </span>
            )}
          </div>

          {/* AI summary */}
          {deal.ai_summary && (
            <p className="mt-1.5 text-xs text-gray-500 leading-relaxed line-clamp-2">
              {deal.ai_summary}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-50">
        <div className="flex items-center gap-2">
          {/* Assignee avatar */}
          {deal.assignee_name ? (
            <div
              title={deal.assignee_name}
              className="w-5 h-5 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-medium flex-shrink-0"
            >
              {deal.assignee_name[0]?.toUpperCase()}
            </div>
          ) : (
            <div
              title="Sem atendente"
              className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs"
            >
              ?
            </div>
          )}

          {/* Unread badge */}
          {hasUnread && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-brand-600">
              <MessageSquare className="w-3 h-3" />
              {deal.unread_count}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* AI analyze button */}
          <button
            onClick={() => onAnalyze(deal.id)}
            disabled={analyzing}
            title="Analisar com IA"
            className="p-1 text-gray-300 hover:text-indigo-500 transition-colors disabled:opacity-50"
          >
            {analyzing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Brain className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Open conversation */}
          {deal.conversation_id && (
            <button
              onClick={() => router.push(`/dashboard/conversations?id=${deal.conversation_id}`)}
              title="Abrir conversa"
              className="p-1 text-gray-300 hover:text-brand-600 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function KanbanPage() {
  const { currentWorkspace } = useAuth();
  const [board,      setBoard]      = useState<KanbanStage[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [analyzing,  setAnalyzing]  = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    if (!currentWorkspace) return;
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/kanban/board`);
    setBoard(data);
    setLoading(false);
  }, [currentWorkspace]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  async function onDragEnd(result: DropResult) {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const newBoard = board.map((stage) => ({ ...stage, deals: [...stage.deals] }));
    const srcStage = newBoard.find((s) => s.id === source.droppableId)!;
    const dstStage = newBoard.find((s) => s.id === destination.droppableId)!;

    const [moved] = srcStage.deals.splice(source.index, 1);
    dstStage.deals.splice(destination.index, 0, { ...moved, stage_id: dstStage.id });
    setBoard(newBoard);

    await api.put(`/workspaces/${currentWorkspace!.id}/kanban/deals/${draggableId}`, {
      stageId: destination.droppableId,
    });
  }

  async function handleAnalyze(dealId: string) {
    if (!currentWorkspace || analyzing) return;
    setAnalyzing(dealId);
    try {
      await api.post(`/workspaces/${currentWorkspace.id}/kanban/deals/${dealId}/analyze`);
      await loadBoard(); // Refresh to get updated AI fields
    } catch {
      // Silently fail — AI might not be configured
    } finally {
      setAnalyzing(null);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Funil de Vendas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  const totalDeals = board.reduce((acc, s) => acc + s.deal_count, 0);

  return (
    <>
      <Header
        title="Funil de Vendas"
        actions={
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{totalDeals} leads</span>
            <button
              onClick={loadBoard}
              className="btn-secondary text-sm"
              title="Atualizar"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-x-auto p-6 bg-gray-50">
        {loading ? (
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-72 flex-shrink-0 bg-gray-200 rounded-xl h-64 animate-pulse" />
            ))}
          </div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div className="flex gap-4 items-start pb-4">
              {board.map((stage) => (
                <div key={stage.id} className="w-72 flex-shrink-0 flex flex-col">

                  {/* Stage header */}
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: stage.color }}
                    />
                    <h3 className="font-semibold text-gray-800 text-sm flex-1 truncate">{stage.name}</h3>
                    <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 rounded-full px-1.5 py-0.5">
                      {stage.deal_count}
                    </span>
                  </div>

                  {/* Stage total value */}
                  {stage.total_value > 0 && (
                    <div className="text-xs text-green-700 font-medium mb-2 px-1">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
                        .format(stage.total_value)}
                    </div>
                  )}

                  {/* Droppable area */}
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={clsx(
                          'rounded-xl p-2 space-y-2 min-h-24 transition-colors',
                          snapshot.isDraggingOver ? 'bg-brand-50 border-2 border-dashed border-brand-300' : 'bg-gray-100'
                        )}
                      >
                        {stage.deals.length === 0 && !snapshot.isDraggingOver && (
                          <div className="text-xs text-gray-400 text-center py-4">
                            Nenhum lead
                          </div>
                        )}

                        {stage.deals.map((deal, index) => (
                          <Draggable key={deal.id} draggableId={deal.id} index={index}>
                            {(prov, snap) => (
                              <div ref={prov.innerRef} {...prov.draggableProps}>
                                <DealCard
                                  deal={deal}
                                  dragHandleProps={prov.dragHandleProps ?? {}}
                                  isDragging={snap.isDragging}
                                  onAnalyze={handleAnalyze}
                                  analyzing={analyzing === deal.id}
                                  workspaceId={currentWorkspace.id}
                                />
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              ))}
            </div>
          </DragDropContext>
        )}
      </div>
    </>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { TicketBoard } from '@/types';
import {
  Plus, LayoutGrid, Archive, Settings, Users,
  Ticket, Calendar, CheckSquare, BarChart2, Copy,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// ── Create board modal ────────────────────────────────────────────────────────

const BOARD_COLORS = [
  '#6366f1', '#f97316', '#22c55e', '#ef4444',
  '#eab308', '#06b6d4', '#8b5cf6', '#ec4899',
];

interface CreateBoardModalProps {
  onClose: () => void;
  onCreate: (board: TicketBoard) => void;
  workspaceId: string;
}

function CreateBoardModal({ onClose, onCreate, workspaceId }: CreateBoardModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(BOARD_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Nome é obrigatório'); return; }
    setLoading(true);
    try {
      const { data } = await api.post<TicketBoard>(`/workspaces/${workspaceId}/tickets/boards`, { name: name.trim(), description: description.trim() || null, color });
      onCreate(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao criar board');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Novo Board</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ex: Suporte ao Cliente"
              className="input w-full"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="input w-full resize-none"
              placeholder="Opcional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
            <div className="flex gap-2 flex-wrap">
              {BOARD_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={clsx('w-7 h-7 rounded-full transition-all', color === c && 'ring-2 ring-offset-2 ring-gray-700')}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? 'Criando...' : 'Criar Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TicketsPage() {
  const router = useRouter();
  const { currentWorkspace, user } = useAuth();

  const [boards, setBoards] = useState<TicketBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [ticketsEnabled, setTicketsEnabled] = useState<boolean | null>(null);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null); // boardId sendo duplicado
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicateLoading, setDuplicateLoading] = useState(false);

  const isAdmin = user?.orgs?.some(o => ['owner', 'admin'].includes(o.role));

  useEffect(() => {
    if (!currentWorkspace) return;
    fetchData();
  }, [currentWorkspace]);

  async function fetchData() {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const [enabledRes, boardsRes] = await Promise.all([
        api.get<{ enabled: boolean }>(`/workspaces/${currentWorkspace.id}/tickets/enabled`),
        api.get<TicketBoard[]>(`/workspaces/${currentWorkspace.id}/tickets/boards`).catch(() => ({ data: [] })),
      ]);
      setTicketsEnabled(enabledRes.data.enabled);
      setBoards(boardsRes.data);
    } catch {
      setTicketsEnabled(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace || !duplicating) return;
    setDuplicateLoading(true);
    try {
      const { data } = await api.post<TicketBoard>(
        `/workspaces/${currentWorkspace.id}/tickets/boards/${duplicating}/duplicate`,
        { name: duplicateName.trim() || undefined }
      );
      setBoards(prev => [data, ...prev]);
      setDuplicating(null);
      setDuplicateName('');
      router.push(`/dashboard/tickets/${data.id}`);
    } catch {
    } finally {
      setDuplicateLoading(false);
    }
  }

  async function handleToggleEnabled() {
    if (!currentWorkspace || !isAdmin) return;
    setTogglingEnabled(true);
    try {
      const { data } = await api.put<{ enabled: boolean }>(`/workspaces/${currentWorkspace.id}/tickets/enabled`, { enabled: !ticketsEnabled });
      setTicketsEnabled(data.enabled);
      if (data.enabled) fetchData();
    } catch {
    } finally {
      setTogglingEnabled(false);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Tickets" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  // Module disabled
  if (ticketsEnabled === false && !loading) {
    return (
      <>
        <Header title="Tickets" />
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <Ticket className="w-8 h-8 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Módulo de Tickets</h2>
            <p className="text-gray-500 max-w-md">
              Gerencie tarefas e tickets estilo Trello, com rastreamento de tempo, lembretes e muito mais.
            </p>
          </div>
          {isAdmin && (
            <button onClick={handleToggleEnabled} disabled={togglingEnabled} className="btn-primary">
              {togglingEnabled ? 'Ativando...' : 'Ativar Módulo de Tickets'}
            </button>
          )}
          {!isAdmin && (
            <p className="text-sm text-gray-400">Peça ao administrador do workspace para ativar este módulo.</p>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Tickets"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/dashboard/tickets/reports')}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <BarChart2 className="w-4 h-4" />
              Relatórios
            </button>
            <button
              onClick={() => router.push('/dashboard/tickets/my-tasks')}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <CheckSquare className="w-4 h-4" />
              Minhas Tarefas
            </button>
            <button
              onClick={() => router.push('/dashboard/tickets/calendar')}
              className="btn-secondary text-sm flex items-center gap-1.5"
            >
              <Calendar className="w-4 h-4" />
              Calendário
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary text-sm flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Novo Board
            </button>
          </div>
        }
      />

      <div className="flex-1 overflow-auto p-6 bg-gray-50">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1,2,3].map(i => <div key={i} className="bg-gray-200 rounded-xl h-40 animate-pulse" />)}
          </div>
        ) : boards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <LayoutGrid className="w-12 h-12 text-gray-300" />
            <div>
              <p className="font-medium text-gray-700">Nenhum board ainda</p>
              <p className="text-sm text-gray-500 mt-1">Crie seu primeiro board para começar a gerenciar tickets.</p>
            </div>
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
              <Plus className="w-4 h-4" /> Criar Board
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {boards.map(board => (
              <button
                key={board.id}
                onClick={() => router.push(`/dashboard/tickets/${board.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:shadow-md transition-shadow group"
              >
                {/* Color stripe */}
                <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ backgroundColor: board.color }}>
                  <LayoutGrid className="w-4 h-4 text-white" />
                </div>
                <div className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
                  {board.name}
                </div>
                {board.description && (
                  <p className="text-xs text-gray-500 mt-1 line-clamp-2">{board.description}</p>
                )}
                <div className="flex items-center gap-3 mt-4 text-xs text-gray-400">
                  <span className="flex items-center gap-1">
                    <LayoutGrid className="w-3.5 h-3.5" />
                    {board.column_count} colunas
                  </span>
                  <span className="flex items-center gap-1">
                    <Ticket className="w-3.5 h-3.5" />
                    {board.ticket_count} tickets
                  </span>
                </div>
                {board.user_role && (
                  <div className="mt-2">
                    <span className={clsx(
                      'inline-block text-xs px-1.5 py-0.5 rounded font-medium',
                      board.user_role === 'manager' ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                    )}>
                      {board.user_role === 'manager' ? 'Manager' : board.user_role === 'member' ? 'Membro' : 'Visualizador'}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">
                    Criado {formatDistanceToNow(new Date(board.created_at), { locale: ptBR, addSuffix: true })}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDuplicating(board.id);
                      setDuplicateName(`${board.name} (cópia)`);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-opacity"
                    title="Duplicar board"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Admin: disable module */}
        {isAdmin && ticketsEnabled && (
          <div className="mt-8 pt-8 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-500">Módulo de Tickets ativo</div>
            <button
              onClick={handleToggleEnabled}
              disabled={togglingEnabled}
              className="text-xs text-red-500 hover:text-red-700 underline"
            >
              {togglingEnabled ? 'Desativando...' : 'Desativar módulo'}
            </button>
          </div>
        )}
      </div>

      {/* Duplicate modal */}
      {duplicating && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Copy className="w-5 h-5 text-indigo-500" /> Duplicar Board
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Cria um novo board com as mesmas colunas e tickets. Ideal para usar como template.
            </p>
            <form onSubmit={handleDuplicate} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome do novo board</label>
                <input
                  autoFocus
                  value={duplicateName}
                  onChange={e => setDuplicateName(e.target.value)}
                  className="input w-full"
                  placeholder="Ex: Projeto Site Cliente X"
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => { setDuplicating(null); setDuplicateName(''); }}
                  className="btn-secondary"
                >
                  Cancelar
                </button>
                <button type="submit" disabled={duplicateLoading} className="btn-primary">
                  {duplicateLoading ? 'Duplicando...' : 'Duplicar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCreate && (
        <CreateBoardModal
          workspaceId={currentWorkspace.id}
          onClose={() => setShowCreate(false)}
          onCreate={(board) => { setBoards(prev => [board, ...prev]); setShowCreate(false); }}
        />
      )}
    </>
  );
}

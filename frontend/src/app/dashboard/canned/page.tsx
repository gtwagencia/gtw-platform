'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { CannedResponse } from '@/types';
import { Plus, Pencil, Trash2, Search, X, Check } from 'lucide-react';

export default function CannedPage() {
  const { currentWorkspace } = useAuth();
  const [items,   setItems]   = useState<CannedResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [editing, setEditing] = useState<Partial<CannedResponse> | null>(null);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/canned`, {
      params: search ? { search } : undefined,
    });
    setItems(data);
    setLoading(false);
  }, [currentWorkspace, search]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!currentWorkspace || !editing) return;
    if (!editing.shortcut?.trim() || !editing.content?.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api.put(`/workspaces/${currentWorkspace.id}/canned/${editing.id}`, editing);
      } else {
        await api.post(`/workspaces/${currentWorkspace.id}/canned`, editing);
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!currentWorkspace || !confirm('Remover esta resposta pronta?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/canned/${id}`);
    load();
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Respostas Prontas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Respostas Prontas"
        actions={
          <button className="btn-primary text-sm" onClick={() => setEditing({ shortcut: '', content: '' })}>
            <Plus className="w-4 h-4" />
            Nova resposta
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Search */}
        <div className="relative max-w-sm mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por atalho ou conteúdo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Edit form */}
        {editing && (
          <div className="card p-5 mb-5 max-w-xl">
            <h3 className="font-semibold text-gray-900 mb-4">
              {editing.id ? 'Editar resposta' : 'Nova resposta pronta'}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Atalho <span className="text-gray-400 font-normal">(use / para ativar no chat)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">/</span>
                  <input
                    className="input pl-7"
                    placeholder="cumprimento"
                    value={editing.shortcut || ''}
                    onChange={e => setEditing(prev => ({ ...prev, shortcut: e.target.value.replace(/\s/g, '-') }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conteúdo da resposta</label>
                <textarea
                  rows={4}
                  className="input resize-none"
                  placeholder="Olá! Obrigado por entrar em contato..."
                  value={editing.content || ''}
                  onChange={e => setEditing(prev => ({ ...prev, content: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !editing.shortcut?.trim() || !editing.content?.trim()}
              >
                <Check className="w-4 h-4" />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              <button className="btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card p-4 h-16 animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="mb-2">Nenhuma resposta pronta criada</p>
            <p className="text-sm">Crie respostas para agilizar o atendimento usando /atalho no chat</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="card p-4 flex items-start gap-3 group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-brand-600">/{item.shortcut}</span>
                    {item.created_by_name && (
                      <span className="text-xs text-gray-400">por {item.created_by_name}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 line-clamp-2">{item.content}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => setEditing(item)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id!)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

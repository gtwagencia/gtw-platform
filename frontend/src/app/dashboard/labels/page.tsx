'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Label } from '@/types';
import { Plus, Pencil, Trash2, Check, Tag } from 'lucide-react';

const PRESET_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316',
  '#eab308','#22c55e','#14b8a6','#06b6d4','#3b82f6',
  '#64748b','#1f2937',
];

export default function LabelsPage() {
  const { currentWorkspace } = useAuth();
  const [items,   setItems]   = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Label> | null>(null);
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/labels`);
    setItems(data);
    setLoading(false);
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!currentWorkspace || !editing?.name?.trim()) return;
    setSaving(true);
    try {
      if (editing.id) {
        await api.put(`/workspaces/${currentWorkspace.id}/labels/${editing.id}`, editing);
      } else {
        await api.post(`/workspaces/${currentWorkspace.id}/labels`, editing);
      }
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!currentWorkspace || !confirm('Remover esta etiqueta? Ela será desassociada de todas as conversas.')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/labels/${id}`);
    load();
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Etiquetas" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Etiquetas"
        actions={
          <button
            className="btn-primary text-sm"
            onClick={() => setEditing({ name: '', color: '#6366f1' })}
          >
            <Plus className="w-4 h-4" />
            Nova etiqueta
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">

        {/* Form */}
        {editing && (
          <div className="card p-5 mb-6">
            <h3 className="font-semibold text-gray-900 mb-4">
              {editing.id ? 'Editar etiqueta' : 'Nova etiqueta'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  className="input"
                  placeholder="Ex: Urgente, VIP, Suporte..."
                  value={editing.name || ''}
                  onChange={e => setEditing(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditing(p => ({ ...p, color: c }))}
                      className="w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center"
                      style={{ backgroundColor: c }}
                    >
                      {editing.color === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                  {/* Custom color */}
                  <input
                    type="color"
                    value={editing.color || '#6366f1'}
                    onChange={e => setEditing(p => ({ ...p, color: e.target.value }))}
                    className="w-7 h-7 rounded-full cursor-pointer border-0 p-0"
                    title="Cor personalizada"
                  />
                </div>
                {/* Preview */}
                <div className="mt-3">
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                    style={{ backgroundColor: (editing.color || '#6366f1') + '25', color: editing.color || '#6366f1' }}
                  >
                    <Tag className="w-3 h-3" />
                    {editing.name || 'Prévia'}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                className="btn-primary"
                onClick={handleSave}
                disabled={saving || !editing.name?.trim()}
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
              <div key={i} className="card p-4 h-14 animate-pulse bg-gray-50" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Tag className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="mb-1">Nenhuma etiqueta criada</p>
            <p className="text-sm">Crie etiquetas para organizar e filtrar conversas</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="card p-4 flex items-center gap-3 group">
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span
                  className="flex-1 text-sm font-medium px-2.5 py-0.5 rounded-full w-fit"
                  style={{ backgroundColor: item.color + '25', color: item.color }}
                >
                  {item.name}
                </span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button
                    onClick={() => setEditing(item)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
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

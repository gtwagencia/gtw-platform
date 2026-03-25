'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { Plus, Trash2, Shield, User, UserCheck } from 'lucide-react';

interface Member {
  user_id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: 'admin' | 'agent';
  department_name: string | null;
}

const ROLES = [
  { value: 'admin',  label: 'Admin',  icon: Shield },
  { value: 'agent',  label: 'Agente', icon: User },
];

export default function MembersPage() {
  const { currentWorkspace, currentOrg } = useAuth();
  const [members,  setMembers]  = useState<Member[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [adding,   setAdding]   = useState(false);
  const [form,     setForm]     = useState({ email: '', role: 'agent' });
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const isManager = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  const load = useCallback(async () => {
    if (!currentWorkspace || !currentOrg) return;
    setLoading(true);
    try {
      const { data } = await api.get(
        `/orgs/${currentOrg.id}/workspaces/${currentWorkspace.id}/members`
      );
      setMembers(data);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, currentOrg]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace || !currentOrg) return;
    setSaving(true);
    setError('');
    try {
      await api.post(
        `/orgs/${currentOrg.id}/workspaces/${currentWorkspace.id}/members`,
        form
      );
      setForm({ email: '', role: 'agent' });
      setAdding(false);
      load();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || 'Erro ao adicionar membro');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(userId: string, role: string) {
    if (!currentWorkspace || !currentOrg) return;
    await api.put(
      `/orgs/${currentOrg.id}/workspaces/${currentWorkspace.id}/members/${userId}/role`,
      { role }
    );
    load();
  }

  async function handleRemove(userId: string) {
    if (!currentWorkspace || !currentOrg || !confirm('Remover este membro?')) return;
    await api.delete(
      `/orgs/${currentOrg.id}/workspaces/${currentWorkspace.id}/members/${userId}`
    );
    load();
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Agentes" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Agentes"
        actions={isManager && (
          <button className="btn-primary text-sm" onClick={() => setAdding(true)}>
            <Plus className="w-4 h-4" />
            Adicionar agente
          </button>
        )}
      />

      <div className="flex-1 overflow-y-auto p-6">
        {adding && (
          <div className="card p-6 mb-6 max-w-md">
            <h2 className="font-semibold text-gray-900 mb-4">Adicionar membro</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  className="input"
                  type="email"
                  required
                  placeholder="agente@exemplo.com"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
                <select
                  className="input"
                  value={form.role}
                  onChange={e => setForm({ ...form, role: e.target.value })}
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Adicionando...' : 'Adicionar'}
                </button>
                <button type="button" className="btn-secondary" onClick={() => { setAdding(false); setError(''); }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="card divide-y divide-gray-100">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 flex items-center gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-100" />
                <div className="flex-1 space-y-1">
                  <div className="h-3 bg-gray-100 rounded w-32" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
              </div>
            ))
          ) : members.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <UserCheck className="w-10 h-10 mx-auto mb-3 text-gray-200" />
              <p className="text-sm">Nenhum membro neste workspace ainda.</p>
            </div>
          ) : (
            members.map(m => (
              <div key={m.user_id} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center
                                text-brand-700 font-semibold text-sm flex-shrink-0">
                  {m.name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 text-sm">{m.name}</div>
                  <div className="text-xs text-gray-400">{m.email}</div>
                  {m.department_name && (
                    <div className="text-xs text-gray-400">{m.department_name}</div>
                  )}
                </div>
                {isManager ? (
                  <select
                    className="input py-1 px-2 text-xs w-28"
                    value={m.role}
                    onChange={e => handleRoleChange(m.user_id, e.target.value)}
                  >
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-500 capitalize">{m.role}</span>
                )}
                {isManager && (
                  <button
                    className="btn-ghost text-xs text-red-500 hover:bg-red-50 p-2"
                    onClick={() => handleRemove(m.user_id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

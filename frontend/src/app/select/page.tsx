'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import type { OrgSummary, Workspace } from '@/types';
import { MessageSquare, Building2, ArrowRight, ChevronLeft, Plus, Loader } from 'lucide-react';
import clsx from 'clsx';
import api from '@/lib/api';

type Step = 'org' | 'workspace';

export default function SelectPage() {
  const router = useRouter();
  const { user, currentOrg, setOrg, setWorkspace, accessToken, _hasHydrated } = useAuth();
  const { workspaces, loading, fetchForOrg } = useWorkspaceStore();

  const [step,          setStep]          = useState<Step>('org');
  const [selectedOrg,   setSelectedOrg]   = useState<OrgSummary | null>(currentOrg);
  const [showCreate,    setShowCreate]    = useState(false);
  const [newWsName,     setNewWsName]     = useState('');
  const [saving,        setSaving]        = useState(false);

  // Redirect to login if not authenticated (wait for hydration first)
  useEffect(() => {
    if (!_hasHydrated) return;
    if (!accessToken || !user) router.replace('/login');
  }, [_hasHydrated, accessToken, user, router]);

  // If only one org and already has workspaces, auto-advance
  useEffect(() => {
    if (!user) return;
    if (user.orgs.length === 1) {
      handleOrgSelect(user.orgs[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleOrgSelect(org: OrgSummary) {
    setSelectedOrg(org);
    setOrg(org);
    const list = await fetchForOrg(org.id);
    if (list.length === 1) {
      handleWorkspaceSelect(list[0]);
      return;
    }
    setStep('workspace');
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedOrg || !newWsName.trim()) return;
    setSaving(true);
    try {
      await api.post(`/orgs/${selectedOrg.id}/workspaces`, { name: newWsName.trim() });
      setNewWsName('');
      setShowCreate(false);
      const list = await fetchForOrg(selectedOrg.id);
      if (list.length === 1) handleWorkspaceSelect(list[0]);
    } finally {
      setSaving(false);
    }
  }

  function handleWorkspaceSelect(ws: Workspace) {
    setWorkspace(ws);
    router.replace('/dashboard');
  }

  if (!user) return null;

  const planBadge = (plan: string) => {
    const map: Record<string, string> = {
      starter:    'badge-gray',
      pro:        'badge-blue',
      enterprise: 'badge-green',
    };
    return map[plan] || 'badge-gray';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-600 to-brand-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white/20 rounded-2xl mb-4">
            <MessageSquare className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">GTW Platform</h1>
          <p className="text-brand-100 text-sm mt-1">Olá, {user.name?.split(' ')[0]}! Escolha onde trabalhar.</p>
        </div>

        <div className="card p-6">
          {/* Step: Organização */}
          {step === 'org' && (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Selecione a organização</h2>
              <p className="text-sm text-gray-400 mb-5">Você tem acesso a {user.orgs.length} organização{user.orgs.length !== 1 ? 's' : ''}.</p>

              <div className="space-y-2">
                {user.orgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleOrgSelect(org)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200
                               hover:border-brand-300 hover:bg-brand-50 transition-all text-left group"
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-brand-600" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{org.name}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={clsx('badge text-xs', planBadge(org.plan))}>{org.plan}</span>
                        <span className="text-xs text-gray-400 capitalize">{org.role}</span>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step: Workspace */}
          {step === 'workspace' && selectedOrg && (
            <>
              <button
                onClick={() => { setStep('org'); setSelectedOrg(null); }}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-700 mb-4 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                {selectedOrg.name}
              </button>

              <h2 className="text-lg font-semibold text-gray-900 mb-1">Selecione o workspace</h2>
              <p className="text-sm text-gray-400 mb-5">Cada workspace representa um cliente ou projeto.</p>

              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader className="w-6 h-6 animate-spin text-brand-500" />
                </div>
              ) : workspaces.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <Plus className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 mb-4">Nenhum workspace encontrado nesta organização.</p>
                  {selectedOrg && ['owner', 'admin'].includes(selectedOrg.role) ? (
                    showCreate ? (
                      <form onSubmit={handleCreateWorkspace} className="flex gap-2 mt-2">
                        <input
                          autoFocus
                          className="input flex-1 text-sm"
                          placeholder="Nome do workspace"
                          value={newWsName}
                          onChange={e => setNewWsName(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn-primary text-sm" disabled={saving}>
                          {saving ? <Loader className="w-4 h-4 animate-spin" /> : 'Criar'}
                        </button>
                        <button type="button" className="btn-secondary text-sm" onClick={() => setShowCreate(false)}>
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <button className="btn-primary text-sm" onClick={() => setShowCreate(true)}>
                        <Plus className="w-4 h-4" />
                        Criar workspace
                      </button>
                    )
                  ) : (
                    <p className="text-xs text-gray-400">Peça ao administrador para criar um workspace.</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedOrg && ['owner', 'admin'].includes(selectedOrg.role) && (
                    showCreate ? (
                      <form onSubmit={handleCreateWorkspace} className="flex gap-2 mb-3">
                        <input
                          autoFocus
                          className="input flex-1 text-sm"
                          placeholder="Nome do workspace"
                          value={newWsName}
                          onChange={e => setNewWsName(e.target.value)}
                          required
                        />
                        <button type="submit" className="btn-primary text-sm" disabled={saving}>
                          {saving ? <Loader className="w-4 h-4 animate-spin" /> : 'Criar'}
                        </button>
                        <button type="button" className="btn-secondary text-sm" onClick={() => setShowCreate(false)}>
                          Cancelar
                        </button>
                      </form>
                    ) : (
                      <button className="btn-secondary text-sm w-full mb-1" onClick={() => setShowCreate(true)}>
                        <Plus className="w-4 h-4" />
                        Novo workspace
                      </button>
                    )
                  )}
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => handleWorkspaceSelect(ws)}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border border-gray-200
                                 hover:border-brand-300 hover:bg-brand-50 transition-all text-left group"
                    >
                      {ws.logo_url ? (
                        <img src={ws.logo_url} alt="" className="w-10 h-10 rounded-xl object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0 text-lg font-bold text-gray-500">
                          {ws.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900">{ws.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {ws.inbox_count ?? 0} inbox{ws.inbox_count !== 1 ? 'es' : ''} · {ws.member_count ?? 0} membro{ws.member_count !== 1 ? 's' : ''}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-brand-500 transition-colors" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <p className="text-center text-brand-200 text-xs mt-6">
          Logado como {user.email}
        </p>
      </div>
    </div>
  );
}

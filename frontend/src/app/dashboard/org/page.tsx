'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Workspace } from '@/types';
import {
  Users, Building2, Plus, Trash2, Shield,
  Crown, User, Mail, Check, X, Loader, Lock,
} from 'lucide-react';
import clsx from 'clsx';

type Tab = 'members' | 'workspaces';

interface Member {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  role: string;
  joined_at: string;
}

const ROLE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  owner:  { label: 'Owner',  icon: Crown,  color: 'text-yellow-600' },
  admin:  { label: 'Admin',  icon: Shield, color: 'text-blue-600' },
  member: { label: 'Membro', icon: User,   color: 'text-gray-500' },
};

export default function OrgPage() {
  const searchParams = useSearchParams();
  const { currentOrg } = useAuth();
  const { workspaces, fetchForOrg } = useWorkspaceStore();

  const [tab,          setTab]          = useState<Tab>((searchParams.get('tab') as Tab) || 'members');
  const [members,      setMembers]      = useState<Member[]>([]);
  const [loading,      setLoading]      = useState(true);
  // Invite
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole,  setInviteRole]    = useState('member');
  const [inviting,    setInviting]      = useState(false);
  const [inviteError, setInviteError]   = useState('');
  // New workspace
  const [wsName,      setWsName]        = useState('');
  const [creatingWs,  setCreatingWs]    = useState(false);
  const [showWsForm,  setShowWsForm]    = useState(false);

  const canManage = currentOrg?.role === 'owner' || currentOrg?.role === 'admin';

  // Bloqueia acesso de não-admins à página
  if (currentOrg && !canManage) {
    return (
      <>
        <Header title="Organização" />
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <Shield className="w-10 h-10 text-gray-300" />
          <p className="text-gray-500 text-sm">Você não tem permissão para acessar esta página.</p>
        </div>
      </>
    );
  }

  const loadMembers = useCallback(async () => {
    if (!currentOrg || !canManage) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/orgs/${currentOrg.id}/members`);
      setMembers(data);
    } finally {
      setLoading(false);
    }
  }, [currentOrg, canManage]);

  useEffect(() => {
    loadMembers();
    if (currentOrg) fetchForOrg(currentOrg.id);
  }, [loadMembers, currentOrg, fetchForOrg]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setInviteError('');
    setInviting(true);
    try {
      await api.post(`/orgs/${currentOrg.id}/members`, { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      loadMembers();
    } catch (err: unknown) {
      setInviteError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao convidar');
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!currentOrg || !confirm('Remover este membro?')) return;
    await api.delete(`/orgs/${currentOrg.id}/members/${userId}`);
    loadMembers();
  }

  async function handleRoleChange(userId: string, role: string) {
    if (!currentOrg) return;
    await api.put(`/orgs/${currentOrg.id}/members/${userId}/role`, { role });
    loadMembers();
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    setCreatingWs(true);
    await api.post(`/orgs/${currentOrg.id}/workspaces`, { name: wsName });
    setWsName('');
    setShowWsForm(false);
    fetchForOrg(currentOrg.id);
    setCreatingWs(false);
  }

  if (!currentOrg) return null;

  return (
    <>
      <Header title="Organização" />

      <div className="flex-1 overflow-y-auto p-6 max-w-4xl">
        {/* Org info */}
        <div className="card p-5 mb-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center flex-shrink-0">
            <Building2 className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-gray-900">{currentOrg.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="badge-blue text-xs">{currentOrg.plan}</span>
              <span className="text-xs text-gray-400">Seu papel: <strong>{currentOrg.role}</strong></span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-6">
          {[
            { key: 'members',    label: 'Membros',    icon: Users },
            { key: 'workspaces', label: 'Workspaces', icon: Building2 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as Tab)}
              className={clsx(
                'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ── Tab: Membros ─────────────────────────────────────── */}
        {tab === 'members' && (
          <div>
            {/* Invite form */}
            {canManage && (
              <form onSubmit={handleInvite} className="card p-4 mb-5">
                <h3 className="font-medium text-gray-900 mb-3">Convidar membro</h3>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      className="input pl-9"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                  </div>
                  <select
                    className="input w-32"
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    <option value="member">Membro</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button type="submit" className="btn-primary" disabled={inviting}>
                    {inviting ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    Convidar
                  </button>
                </div>
                {inviteError && (
                  <p className="text-sm text-red-600 mt-2">{inviteError}</p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  O usuário deve ter uma conta cadastrada na plataforma.
                </p>
              </form>
            )}

            {/* Members list */}
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Membro</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Papel</th>
                    {canManage && <th className="px-4 py-3" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-3"><div className="h-4 w-48 bg-gray-100 animate-pulse rounded" /></td>
                        <td className="px-4 py-3"><div className="h-4 w-20 bg-gray-100 animate-pulse rounded" /></td>
                      </tr>
                    ))
                  ) : members.map((m) => {
                    const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS.member;
                    const RoleIcon = roleInfo.icon;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center
                                            text-brand-700 text-sm font-medium flex-shrink-0">
                              {m.name[0]?.toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">{m.name}</div>
                              <div className="text-xs text-gray-400">{m.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {canManage ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.id, e.target.value)}
                              className={clsx('text-sm font-medium bg-transparent border-none outline-none cursor-pointer', roleInfo.color)}
                            >
                              <option value="member">Membro</option>
                              <option value="admin">Admin</option>
                              <option value="owner">Owner</option>
                            </select>
                          ) : (
                            <span className={clsx('flex items-center gap-1.5 text-sm font-medium', roleInfo.color)}>
                              <RoleIcon className="w-3.5 h-3.5" />
                              {roleInfo.label}
                            </span>
                          )}
                        </td>
                        {canManage && (
                          <td className="px-4 py-3 text-right">
                            {m.role !== 'owner' && (
                              <button
                                onClick={() => handleRemoveMember(m.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors p-1"
                                title="Remover"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tab: Workspaces ──────────────────────────────────── */}
        {tab === 'workspaces' && (
          <div>
            {canManage && (
              <div className="mb-5">
                {!showWsForm ? (
                  <button className="btn-primary" onClick={() => setShowWsForm(true)}>
                    <Plus className="w-4 h-4" />
                    Novo workspace
                  </button>
                ) : (
                  <form onSubmit={handleCreateWorkspace} className="card p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Criar workspace</h3>
                    <div className="flex gap-2">
                      <input
                        className="input flex-1"
                        placeholder="Nome do workspace (ex: Cliente ABC)"
                        value={wsName}
                        onChange={(e) => setWsName(e.target.value)}
                        required
                        autoFocus
                      />
                      <button type="submit" className="btn-primary" disabled={creatingWs}>
                        {creatingWs ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Criar
                      </button>
                      <button type="button" className="btn-secondary" onClick={() => setShowWsForm(false)}>
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {workspaces.map((ws) => (
                <div key={ws.id} className="card p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center
                                    text-gray-600 font-bold text-lg flex-shrink-0">
                      {ws.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900">{ws.name}</div>
                      <div className="text-xs text-gray-400">{ws.timezone}</div>
                    </div>
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500">
                    <span>{ws.inbox_count ?? 0} inboxes</span>
                    <span>{ws.member_count ?? 0} membros</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

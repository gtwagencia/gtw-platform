'use client';

import { useState } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import { User, Lock, Save, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

type AlertType = { type: 'success' | 'error'; msg: string } | null;

export default function ProfilePage() {
  const { user, fetchMe } = useAuth();

  // ── Profile form ───────────────────────────────────────
  const [name,         setName]         = useState(user?.name || '');
  const [avatarUrl,    setAvatarUrl]    = useState(user?.avatar_url || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileAlert,  setProfileAlert]  = useState<AlertType>(null);

  // ── Password form ──────────────────────────────────────
  const [currentPwd,  setCurrentPwd]  = useState('');
  const [newPwd,      setNewPwd]      = useState('');
  const [confirmPwd,  setConfirmPwd]  = useState('');
  const [showPwds,    setShowPwds]    = useState(false);
  const [savingPwd,   setSavingPwd]   = useState(false);
  const [pwdAlert,    setPwdAlert]    = useState<AlertType>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setProfileAlert(null);
    setSavingProfile(true);
    try {
      await api.put('/auth/me/profile', { name, avatarUrl: avatarUrl || null });
      await fetchMe();
      setProfileAlert({ type: 'success', msg: 'Perfil atualizado com sucesso!' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Erro ao atualizar perfil';
      setProfileAlert({ type: 'error', msg });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdAlert(null);
    if (newPwd !== confirmPwd) {
      setPwdAlert({ type: 'error', msg: 'As senhas não coincidem' });
      return;
    }
    if (newPwd.length < 8) {
      setPwdAlert({ type: 'error', msg: 'A nova senha deve ter ao menos 8 caracteres' });
      return;
    }
    setSavingPwd(true);
    try {
      await api.put('/auth/me/password', { currentPassword: currentPwd, newPassword: newPwd });
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
      setPwdAlert({ type: 'success', msg: 'Senha alterada com sucesso!' });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })
        ?.response?.data?.error || 'Erro ao alterar senha';
      setPwdAlert({ type: 'error', msg });
    } finally {
      setSavingPwd(false);
    }
  }

  function Alert({ alert }: { alert: AlertType }) {
    if (!alert) return null;
    return (
      <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
        alert.type === 'success'
          ? 'bg-green-50 border border-green-200 text-green-700'
          : 'bg-red-50 border border-red-200 text-red-700'
      }`}>
        {alert.type === 'success'
          ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
          : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
        {alert.msg}
      </div>
    );
  }

  return (
    <>
      <Header title="Meu Perfil" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">

          {/* ── Avatar + Info ───────────────────────────────────── */}
          <div className="card p-6">
            <div className="flex items-center gap-5 mb-6">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Avatar"
                  className="w-20 h-20 rounded-full object-cover border-2 border-brand-100"
                  onError={() => setAvatarUrl('')}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-brand-600 flex items-center justify-center
                                text-white text-3xl font-bold flex-shrink-0">
                  {user?.name?.[0]?.toUpperCase()}
                </div>
              )}
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{user?.name}</h2>
                <p className="text-sm text-gray-400">{user?.email}</p>
                {user?.is_super_admin && (
                  <span className="badge-blue text-xs mt-1">Super Admin</span>
                )}
              </div>
            </div>

            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" />
              Informações pessoais
            </h3>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  E-mail
                </label>
                <input
                  className="input bg-gray-50 text-gray-400 cursor-not-allowed"
                  value={user?.email || ''}
                  disabled
                />
                <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL do avatar</label>
                <input
                  className="input"
                  type="url"
                  placeholder="https://exemplo.com/foto.jpg"
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                />
              </div>

              <Alert alert={profileAlert} />

              <button type="submit" className="btn-primary" disabled={savingProfile}>
                <Save className="w-4 h-4" />
                {savingProfile ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </form>
          </div>

          {/* ── Change Password ─────────────────────────────────── */}
          <div className="card p-6">
            <h3 className="font-medium text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-4 h-4 text-gray-400" />
              Alterar senha
            </h3>

            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha atual</label>
                <div className="relative">
                  <input
                    className="input pr-10"
                    type={showPwds ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwds(!showPwds)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPwds ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
                <input
                  className="input"
                  type={showPwds ? 'text' : 'password'}
                  placeholder="Mínimo 8 caracteres"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  required
                  minLength={8}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
                <input
                  className="input"
                  type={showPwds ? 'text' : 'password'}
                  placeholder="Repita a nova senha"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                />
              </div>

              <Alert alert={pwdAlert} />

              <button type="submit" className="btn-primary" disabled={savingPwd}>
                <Lock className="w-4 h-4" />
                {savingPwd ? 'Alterando...' : 'Alterar senha'}
              </button>
            </form>
          </div>

          {/* ── Orgs ────────────────────────────────────────────── */}
          <div className="card p-6">
            <h3 className="font-medium text-gray-900 mb-4">Suas organizações</h3>
            <div className="space-y-2">
              {user?.orgs.map((org) => (
                <div key={org.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center
                                  text-brand-700 text-sm font-bold flex-shrink-0">
                    {org.name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-sm truncate">{org.name}</div>
                    <div className="text-xs text-gray-400 capitalize">{org.role} · {org.plan}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </>
  );
}

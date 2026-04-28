'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { BusinessHours, BusinessHoursDay } from '@/types';
import { Save, Eye, EyeOff, Brain, Clock, MessageSquare, CheckCircle } from 'lucide-react';
import clsx from 'clsx';

// ── Default business hours ───────────────────────────────────────────────────

const DEFAULT_DAY: BusinessHoursDay = { open: '08:00', close: '18:00', enabled: true };
const DEFAULT_DAY_OFF: BusinessHoursDay = { open: '08:00', close: '12:00', enabled: false };

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled:   false,
  timezone:  'America/Sao_Paulo',
  monday:    { ...DEFAULT_DAY },
  tuesday:   { ...DEFAULT_DAY },
  wednesday: { ...DEFAULT_DAY },
  thursday:  { ...DEFAULT_DAY },
  friday:    { ...DEFAULT_DAY },
  saturday:  { ...DEFAULT_DAY_OFF },
  sunday:    { ...DEFAULT_DAY_OFF },
};

const DAY_LABELS: Record<string, string> = {
  monday:    'Segunda',
  tuesday:   'Terça',
  wednesday: 'Quarta',
  thursday:  'Quinta',
  friday:    'Sexta',
  saturday:  'Sábado',
  sunday:    'Domingo',
};

const DAY_KEYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { currentWorkspace, setWorkspace, user } = useAuth();
  const isSuperAdmin = (user as any)?.isSuperAdmin === true;

  const [form, setForm] = useState({
    name:                 '',
    timezone:             'America/Sao_Paulo',
    metaPixelId:          '',
    metaAdAccountId:      '',
    metaAccessToken:      '',
    metaConversionsToken: '',
    followUpEnabled:      false,
    aiAnalysisEnabled:         false,
    aiAnalysisIntervalMinutes: 60,
    ticketStorageQuotaMb:      5120,
    aiIgnoreGroups:       true,
    anthropicApiKey:      '',
    openaiApiKey:         '',
    aiProvider:           'anthropic',
    aiModel:              '',
  });

  const [businessHours, setBusinessHours] = useState<BusinessHours>(DEFAULT_BUSINESS_HOURS);
  const [showTokens,    setShowTokens]    = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);

  useEffect(() => {
    if (currentWorkspace) {
      setForm({
        name:                 currentWorkspace.name,
        timezone:             currentWorkspace.timezone,
        metaPixelId:          currentWorkspace.meta_pixel_id || '',
        metaAdAccountId:      currentWorkspace.meta_ad_account_id || '',
        metaAccessToken:      '',
        metaConversionsToken: '',
        followUpEnabled:      currentWorkspace.follow_up_enabled ?? false,
        aiAnalysisEnabled:         currentWorkspace.ai_analysis_enabled ?? false,
        aiAnalysisIntervalMinutes: currentWorkspace.ai_analysis_interval_minutes ?? 60,
        ticketStorageQuotaMb:      currentWorkspace.ticket_storage_quota_mb ?? 5120,
        aiIgnoreGroups:       currentWorkspace.ai_ignore_groups ?? true,
        anthropicApiKey:      '',
        openaiApiKey:         '',
        aiProvider:           currentWorkspace.ai_provider || 'anthropic',
        aiModel:              currentWorkspace.ai_model    || '',
      });
      setBusinessHours(currentWorkspace.business_hours ?? DEFAULT_BUSINESS_HOURS);
    }
  }, [currentWorkspace]);

  function updateDay(day: typeof DAY_KEYS[number], field: keyof BusinessHoursDay, value: string | boolean) {
    setBusinessHours(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form,
        businessHours,
      };
      // Don't send empty tokens (would overwrite existing ones)
      if (!payload.metaAccessToken)      delete payload.metaAccessToken;
      if (!payload.metaConversionsToken) delete payload.metaConversionsToken;
      if (!payload.anthropicApiKey)      delete payload.anthropicApiKey;
      if (!payload.openaiApiKey)         delete payload.openaiApiKey;

      const { data } = await api.put(
        `/orgs/${currentWorkspace.org_id}/workspaces/${currentWorkspace.id}`,
        payload
      );
      setWorkspace(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Configurações" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header title="Configurações" />

      <div className="flex-1 overflow-y-auto p-6 max-w-2xl">
        <form onSubmit={handleSave} className="space-y-6">

          {/* ── Workspace geral ────────────────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Workspace</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fuso horário</label>
                <select
                  className="input"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                >
                  <option value="America/Sao_Paulo">America/Sao_Paulo (BRT)</option>
                  <option value="America/Manaus">America/Manaus (AMT)</option>
                  <option value="America/Belem">America/Belem</option>
                  <option value="America/Fortaleza">America/Fortaleza</option>
                  <option value="America/Recife">America/Recife</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Meta Ads ───────────────────────────────────────────── */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">Meta Ads / Conversions API</h2>
              <button
                type="button"
                onClick={() => setShowTokens(!showTokens)}
                className="btn-ghost text-xs"
              >
                {showTokens
                  ? <><EyeOff className="w-3.5 h-3.5" />Ocultar</>
                  : <><Eye className="w-3.5 h-3.5" />Mostrar</>
                }
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pixel ID</label>
                <input
                  className="input"
                  value={form.metaPixelId}
                  onChange={(e) => setForm({ ...form, metaPixelId: e.target.value })}
                  placeholder="123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ad Account ID</label>
                <input
                  className="input"
                  value={form.metaAdAccountId}
                  onChange={(e) => setForm({ ...form, metaAdAccountId: e.target.value })}
                  placeholder="act_123456789"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Access Token</label>
                {currentWorkspace.has_meta_access_token && !form.metaAccessToken && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Chave salva — deixe em branco para manter
                  </div>
                )}
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.metaAccessToken}
                  onChange={(e) => setForm({ ...form, metaAccessToken: e.target.value })}
                  placeholder={currentWorkspace.has_meta_access_token ? '••••••••••••• (manter atual)' : 'Cole o token aqui para configurar'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Conversions API Token</label>
                {currentWorkspace.has_meta_conversions_token && !form.metaConversionsToken && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Chave salva — deixe em branco para manter
                  </div>
                )}
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.metaConversionsToken}
                  onChange={(e) => setForm({ ...form, metaConversionsToken: e.target.value })}
                  placeholder={currentWorkspace.has_meta_conversions_token ? '••••••••••••• (manter atual)' : 'Cole o token aqui para configurar'}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Usado para enviar eventos Lead e Purchase à Meta Conversions API automaticamente.
                </p>
              </div>
            </div>
          </div>

          {/* ── IA e Follow-up ─────────────────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Brain className="w-4 h-4 text-indigo-500" />
              Inteligência Artificial
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Qualificação automática de leads e geração de mensagens de follow-up.
            </p>

            <div className="space-y-4">
              {/* AI Provider selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provedor de IA</label>
                <div className="flex gap-3">
                  {[
                    { value: 'anthropic', label: 'Claude (Anthropic)' },
                    { value: 'openai',    label: 'ChatGPT (OpenAI)' },
                  ].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="aiProvider"
                        value={opt.value}
                        checked={form.aiProvider === opt.value}
                        onChange={(e) => setForm({ ...form, aiProvider: e.target.value })}
                        className="text-indigo-600"
                      />
                      <span className="text-sm text-gray-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Model selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Modelo</label>
                <select
                  className="input"
                  value={form.aiModel}
                  onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                >
                  <option value="">Padrão automático</option>
                  {form.aiProvider === 'openai' ? (
                    <>
                      <optgroup label="GPT-4o">
                        <option value="gpt-4o">gpt-4o (mais poderoso)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini (rápido e barato)</option>
                      </optgroup>
                      <optgroup label="GPT-4.1">
                        <option value="gpt-4.1">gpt-4.1</option>
                        <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                        <option value="gpt-4.1-nano">gpt-4.1-nano (mais barato)</option>
                      </optgroup>
                      <optgroup label="o-series (raciocínio)">
                        <option value="o3-mini">o3-mini</option>
                        <option value="o4-mini">o4-mini</option>
                      </optgroup>
                    </>
                  ) : (
                    <>
                      <optgroup label="Claude Sonnet">
                        <option value="claude-sonnet-4-6">claude-sonnet-4-6 (recomendado)</option>
                      </optgroup>
                      <optgroup label="Claude Haiku (rápido)">
                        <option value="claude-haiku-4-5-20251001">claude-haiku-4-5 (rápido e barato)</option>
                      </optgroup>
                      <optgroup label="Claude Opus">
                        <option value="claude-opus-4-6">claude-opus-4-6 (mais poderoso)</option>
                      </optgroup>
                    </>
                  )}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  "Padrão automático" usa modelos balanceados por tipo de tarefa.
                </p>
              </div>

              {/* Anthropic API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chave API Anthropic (Claude)
                </label>
                {currentWorkspace.has_anthropic_key && !form.anthropicApiKey && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Chave salva — deixe em branco para manter
                  </div>
                )}
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.anthropicApiKey}
                  onChange={(e) => setForm({ ...form, anthropicApiKey: e.target.value })}
                  placeholder={currentWorkspace.has_anthropic_key ? '••••••••••••• (manter atual)' : 'sk-ant-... (cole aqui para configurar)'}
                />
              </div>

              {/* OpenAI API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chave API OpenAI (ChatGPT)
                </label>
                {currentWorkspace.has_openai_key && !form.openaiApiKey && (
                  <div className="flex items-center gap-1.5 text-xs text-green-600 mb-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Chave salva — deixe em branco para manter
                  </div>
                )}
                <input
                  className="input font-mono text-xs"
                  type={showTokens ? 'text' : 'password'}
                  value={form.openaiApiKey}
                  onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
                  placeholder={currentWorkspace.has_openai_key ? '••••••••••••• (manter atual)' : 'sk-... (cole aqui para configurar)'}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Configure o provedor ativo acima. Pode ter ambas as chaves salvas.
                </p>
              </div>

              {/* AI Analysis toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.aiAnalysisEnabled}
                    onChange={(e) => setForm({ ...form, aiAnalysisEnabled: e.target.checked })}
                  />
                  <div className={clsx(
                    'w-10 h-5 rounded-full transition-colors',
                    form.aiAnalysisEnabled ? 'bg-indigo-500' : 'bg-gray-200'
                  )} />
                  <div className={clsx(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    form.aiAnalysisEnabled && 'translate-x-5'
                  )} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900">Análise automática de leads</div>
                  <div className="text-xs text-gray-500">
                    A IA lê as conversas e qualifica cada lead no funil automaticamente
                  </div>
                </div>
              </label>

              {form.aiAnalysisEnabled && (
                <div className="ml-13 pl-1">
                  <label className="text-xs font-medium text-gray-600 block mb-1">Intervalo entre análises</label>
                  <select
                    className="input text-sm w-48"
                    value={form.aiAnalysisIntervalMinutes}
                    onChange={e => setForm({ ...form, aiAnalysisIntervalMinutes: parseInt(e.target.value) })}
                  >
                    <option value={5}>A cada 5 minutos</option>
                    <option value={15}>A cada 15 minutos</option>
                    <option value={30}>A cada 30 minutos</option>
                    <option value={60}>A cada 1 hora</option>
                    <option value={120}>A cada 2 horas</option>
                    <option value={240}>A cada 4 horas</option>
                    <option value={480}>A cada 8 horas</option>
                    <option value={1440}>A cada 24 horas</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Intervalos menores consomem mais tokens da IA.</p>
                </div>
              )}

              {/* Follow-up toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.followUpEnabled}
                    onChange={(e) => setForm({ ...form, followUpEnabled: e.target.checked })}
                  />
                  <div className={clsx(
                    'w-10 h-5 rounded-full transition-colors',
                    form.followUpEnabled ? 'bg-indigo-500' : 'bg-gray-200'
                  )} />
                  <div className={clsx(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    form.followUpEnabled && 'translate-x-5'
                  )} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-orange-500" />
                    Follow-up automático por IA
                  </div>
                  <div className="text-xs text-gray-500">
                    Envia mensagens automáticas após 30 min, 1 dia e 3 dias sem resposta
                  </div>
                </div>
              </label>
            </div>

            {/* AI ignora grupos */}
            <div className="border border-gray-100 rounded-lg p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.aiIgnoreGroups}
                    onChange={(e) => setForm({ ...form, aiIgnoreGroups: e.target.checked })}
                  />
                  <div className={clsx(
                    'w-10 h-5 rounded-full transition-colors',
                    form.aiIgnoreGroups ? 'bg-indigo-500' : 'bg-gray-200'
                  )} />
                  <div className={clsx(
                    'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                    form.aiIgnoreGroups && 'translate-x-5'
                  )} />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-gray-400" />
                    IA ignora grupos
                  </div>
                  <div className="text-xs text-gray-500">
                    Quando ativo, o funil de IA (chatbot e análise) não processa mensagens de grupos do WhatsApp
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* ── Armazenamento de Tickets (superadmin) ─────────────── */}
          {isSuperAdmin && (
            <div className="card p-6">
              <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Save className="w-4 h-4 text-gray-500" />
                Armazenamento de Tickets
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Limite de espaço em disco para arquivos anexados aos tickets deste workspace.
              </p>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-xs">
                  <label className="text-xs font-medium text-gray-700 mb-1 block">Quota máxima</label>
                  <select
                    className="input w-full"
                    value={form.ticketStorageQuotaMb}
                    onChange={e => setForm({ ...form, ticketStorageQuotaMb: parseInt(e.target.value) })}
                  >
                    <option value={512}>512 MB</option>
                    <option value={1024}>1 GB</option>
                    <option value={2048}>2 GB</option>
                    <option value={5120}>5 GB</option>
                    <option value={10240}>10 GB</option>
                    <option value={20480}>20 GB</option>
                    <option value={51200}>50 GB</option>
                  </select>
                </div>
                <p className="text-xs text-gray-400 mt-5">Visível apenas para superadmin</p>
              </div>
            </div>
          )}

          {/* ── Horário comercial ──────────────────────────────────── */}
          <div className="card p-6">
            <h2 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500" />
              Horário Comercial
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Follow-ups só são enviados dentro deste horário.
            </p>

            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer mb-4">
              <div className="relative flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={businessHours.enabled}
                  onChange={(e) => setBusinessHours(prev => ({ ...prev, enabled: e.target.checked }))}
                />
                <div className={clsx(
                  'w-10 h-5 rounded-full transition-colors',
                  businessHours.enabled ? 'bg-orange-500' : 'bg-gray-200'
                )} />
                <div className={clsx(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform',
                  businessHours.enabled && 'translate-x-5'
                )} />
              </div>
              <span className="text-sm font-medium text-gray-900">
                {businessHours.enabled ? 'Ativado' : 'Desativado (envia a qualquer hora)'}
              </span>
            </label>

            {businessHours.enabled && (
              <div className="space-y-2">
                {DAY_KEYS.map(day => {
                  const conf = businessHours[day];
                  return (
                    <div key={day} className="flex items-center gap-3">
                      <label className="flex items-center gap-2 w-28 flex-shrink-0 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={conf.enabled}
                          onChange={(e) => updateDay(day, 'enabled', e.target.checked)}
                          className="rounded border-gray-300 text-orange-500"
                        />
                        <span className={clsx(
                          'text-sm',
                          conf.enabled ? 'text-gray-900 font-medium' : 'text-gray-400'
                        )}>
                          {DAY_LABELS[day]}
                        </span>
                      </label>

                      {conf.enabled ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            className="input py-1 px-2 text-sm w-28"
                            value={conf.open}
                            onChange={(e) => updateDay(day, 'open', e.target.value)}
                          />
                          <span className="text-gray-400 text-sm">até</span>
                          <input
                            type="time"
                            className="input py-1 px-2 text-sm w-28"
                            value={conf.close}
                            onChange={(e) => updateDay(day, 'close', e.target.value)}
                          />
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">Fechado</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button type="submit" className="btn-primary" disabled={saving}>
            <Save className="w-4 h-4" />
            {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </form>
      </div>
    </>
  );
}

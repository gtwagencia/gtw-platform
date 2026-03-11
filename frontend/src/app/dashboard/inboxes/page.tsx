'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Inbox } from '@/types';
import { Plus, Wifi, WifiOff, Loader, QrCode, Trash2 } from 'lucide-react';

export default function InboxesPage() {
  const { currentWorkspace } = useAuth();
  const [inboxes,  setInboxes]  = useState<Inbox[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [qrInbox,  setQrInbox]  = useState<Inbox | null>(null);
  const [creating, setCreating] = useState(false);
  const [form,     setForm]     = useState({ name: '', evolutionApiUrl: '', evolutionApiKey: '', evolutionInstance: '' });

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    const { data } = await api.get(`/workspaces/${currentWorkspace.id}/inboxes`);
    setInboxes(data);
    setLoading(false);
  }, [currentWorkspace]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!currentWorkspace) return;
    await api.post(`/workspaces/${currentWorkspace.id}/inboxes`, form);
    setCreating(false);
    setForm({ name: '', evolutionApiUrl: '', evolutionApiKey: '', evolutionInstance: '' });
    load();
  }

  async function handleDelete(inboxId: string) {
    if (!currentWorkspace) return;
    if (!confirm('Remover este inbox?')) return;
    await api.delete(`/workspaces/${currentWorkspace.id}/inboxes/${inboxId}`);
    load();
  }

  const statusBadge = (status: string) => {
    if (status === 'connected')    return <span className="badge-green flex items-center gap-1"><Wifi className="w-3 h-3" />Conectado</span>;
    if (status === 'connecting')   return <span className="badge-yellow flex items-center gap-1"><Loader className="w-3 h-3 animate-spin" />Conectando</span>;
    return <span className="badge-red flex items-center gap-1"><WifiOff className="w-3 h-3" />Desconectado</span>;
  };

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Inboxes" />
        <div className="flex-1 flex items-center justify-center text-gray-400">Selecione um workspace</div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Inboxes"
        actions={
          <button className="btn-primary text-sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4" />
            Novo inbox
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Create form */}
        {creating && (
          <div className="card p-6 mb-6 max-w-lg">
            <h2 className="font-semibold text-gray-900 mb-4">Criar inbox WhatsApp</h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Ex: WhatsApp Vendas" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Evolution API URL</label>
                <input className="input" value={form.evolutionApiUrl} onChange={(e) => setForm({ ...form, evolutionApiUrl: e.target.value })} placeholder="https://evolution.meuserver.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                <input className="input" value={form.evolutionApiKey} onChange={(e) => setForm({ ...form, evolutionApiKey: e.target.value })} placeholder="sua-api-key" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instance name</label>
                <input className="input" value={form.evolutionInstance} onChange={(e) => setForm({ ...form, evolutionInstance: e.target.value })} placeholder="minha-instancia" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="btn-primary">Criar</button>
                <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        )}

        {/* QR Code modal */}
        {qrInbox?.qr_code && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setQrInbox(null)}>
            <div className="card p-6 text-center" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-semibold text-gray-900 mb-4">Escanear QR Code — {qrInbox.name}</h3>
              <img
                src={`data:image/png;base64,${qrInbox.qr_code}`}
                alt="QR Code"
                className="w-64 h-64 mx-auto"
              />
              <p className="text-sm text-gray-500 mt-3">Abra o WhatsApp e escaneie este código</p>
              <button className="btn-secondary mt-4" onClick={() => setQrInbox(null)}>Fechar</button>
            </div>
          </div>
        )}

        {/* Inboxes list */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-5 h-32 animate-pulse bg-gray-50" />
            ))
          ) : inboxes.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-gray-400">
              Nenhum inbox criado ainda. Crie o primeiro!
            </div>
          ) : (
            inboxes.map((inbox) => (
              <div key={inbox.id} className="card p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-gray-900">{inbox.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">{inbox.channel_type}</p>
                  </div>
                  {statusBadge(inbox.connection_status)}
                </div>

                {inbox.phone_number && (
                  <p className="text-sm text-gray-600 mb-3">{inbox.phone_number}</p>
                )}

                <div className="flex gap-2">
                  {inbox.qr_code && (
                    <button className="btn-secondary text-xs" onClick={() => setQrInbox(inbox)}>
                      <QrCode className="w-3.5 h-3.5" />
                      QR Code
                    </button>
                  )}
                  <button
                    className="btn-ghost text-xs text-red-500 hover:bg-red-50 ml-auto"
                    onClick={() => handleDelete(inbox.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="mt-3 text-xs text-gray-400">
                  Webhook: <code className="text-brand-600">POST /api/v1/webhooks/evolution/{inbox.id}</code>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

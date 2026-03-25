'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Contact } from '@/types';
import { Search, Plus, Mail, X, MessageSquare, ExternalLink, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

interface ContactFormData {
  name: string;
  phone: string;
  email: string;
  notes: string;
  tags: string; // comma-separated
}

function ContactForm({ contact, workspaceId, onSave, onClose }: {
  contact?: Contact;
  workspaceId: string;
  onSave: (c: Contact) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ContactFormData>({
    name:  contact?.name  || '',
    phone: contact?.phone || '',
    email: contact?.email || '',
    notes: contact?.notes || '',
    tags:  contact?.tags?.join(', ') || '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Nome é obrigatório'); return; }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name:  form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
        tags:  form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      };
      const { data } = contact
        ? await api.put(`/workspaces/${workspaceId}/contacts/${contact.id}`, payload)
        : await api.post(`/workspaces/${workspaceId}/contacts`, payload);
      onSave(data);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-96" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-gray-900">{contact ? 'Editar contato' : 'Novo contato'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome *</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome completo" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
            <input className="input" value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="5511999999999" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
            <input className="input" type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tags <span className="text-gray-400">(separadas por vírgula)</span></label>
            <input className="input" value={form.tags} onChange={e => setForm(p => ({ ...p, tags: e.target.value }))} placeholder="lead, premium, urgente" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notas</label>
            <textarea className="input resize-none" rows={3} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observações sobre o contato..." />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">
              {saving ? 'Salvando...' : contact ? 'Salvar' : 'Criar contato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConvSummary {
  id: string;
  status: string;
  created_at: string;
  last_message_at: string | null;
  last_message_text: string | null;
  inbox_name: string;
  assignee_name: string | null;
  unread_count: number;
  sla_breached: boolean;
}

const STATUS_LABEL: Record<string, string> = { open: 'Aberta', pending: 'Pendente', resolved: 'Resolvida' };
const STATUS_COLOR: Record<string, string> = {
  open:     'bg-green-100 text-green-700',
  pending:  'bg-yellow-100 text-yellow-700',
  resolved: 'bg-gray-100 text-gray-600',
};

function ContactPanel({ contact, workspaceId, onClose, onEdit }: {
  contact: Contact;
  workspaceId: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [convs,    setConvs]    = useState<ConvSummary[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.get(`/workspaces/${workspaceId}/contacts/${contact.id}/conversations`)
      .then(({ data }) => setConvs(data))
      .finally(() => setLoading(false));
  }, [contact.id, workspaceId]);

  return (
    <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <span className="font-semibold text-gray-900 text-sm">Perfil do contato</span>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" title="Editar">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact info */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-lg font-semibold flex-shrink-0">
              {contact.name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-gray-900 truncate">{contact.name}</div>
              {contact.phone && <div className="text-sm text-gray-500">{contact.phone}</div>}
            </div>
          </div>

          <div className="space-y-1.5 text-sm">
            {contact.email && (
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}
            {contact.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {contact.tags.map(tag => (
                  <span key={tag} className="badge-blue text-xs">{tag}</span>
                ))}
              </div>
            )}
            {contact.notes && (
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2 mt-2">{contact.notes}</p>
            )}
          </div>

          {(contact.utm_source || contact.utm_campaign) && (
            <div className="mt-3 text-xs text-gray-400">
              <span className="font-medium">UTM:</span> {contact.utm_source} / {contact.utm_campaign}
            </div>
          )}
        </div>

        {/* Conversations history */}
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Histórico de conversas
            </span>
            <span className="text-xs text-gray-400">{convs.length} total</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
              ))}
            </div>
          ) : convs.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhuma conversa ainda
            </div>
          ) : (
            <div className="space-y-2">
              {convs.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => router.push(`/dashboard/conversations?id=${conv.id}`)}
                  className="w-full text-left rounded-xl border border-gray-200 p-3 hover:border-brand-300 hover:bg-brand-50 transition-colors group"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={clsx('text-xs px-1.5 py-0.5 rounded-full font-medium', STATUS_COLOR[conv.status] || 'bg-gray-100 text-gray-600')}>
                      {STATUS_LABEL[conv.status] || conv.status}
                    </span>
                    <div className="flex items-center gap-1 text-gray-400 group-hover:text-brand-600 transition-colors">
                      <ExternalLink className="w-3 h-3" />
                    </div>
                  </div>
                  <div className="text-xs text-gray-700 truncate">
                    {conv.last_message_text || <em className="text-gray-400">sem mensagens</em>}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    <span className="text-xs text-gray-400">{conv.inbox_name}</span>
                    <span className="text-xs text-gray-400">
                      {conv.last_message_at
                        ? format(new Date(conv.last_message_at), "d MMM', 'HH:mm", { locale: ptBR })
                        : format(new Date(conv.created_at), "d MMM', 'HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {conv.sla_breached && (
                    <div className="mt-1 text-xs text-red-600 font-medium">⚠ SLA excedido</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ContactsPage() {
  const { currentWorkspace } = useAuth();
  const [contacts,  setContacts]  = useState<Contact[]>([]);
  const [total,     setTotal]     = useState(0);
  const [search,    setSearch]    = useState('');
  const [page,      setPage]      = useState(1);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState<Contact | null>(null);
  const [formOpen,  setFormOpen]  = useState(false);
  const [editing,   setEditing]   = useState<Contact | undefined>(undefined);

  const load = useCallback(async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/workspaces/${currentWorkspace.id}/contacts`, {
        params: { search: search || undefined, page, limit: 50 },
      });
      setContacts(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace, search, page]);

  useEffect(() => { load(); }, [load]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); load(); }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (!currentWorkspace) {
    return (
      <>
        <Header title="Contatos" />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          Selecione um workspace
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title={`Contatos (${total})`}
        actions={
          <button
            className="btn-primary text-sm"
            onClick={() => { setEditing(undefined); setFormOpen(true); }}
          >
            <Plus className="w-4 h-4" />
            Novo contato
          </button>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Search bar */}
          <div className="mb-4 relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pl-9"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contato</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Telefone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">Tags</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden lg:table-cell">UTM</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden xl:table-cell">Criado em</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Convs</th>
                <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-gray-100 animate-pulse rounded w-3/4" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : contacts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      Nenhum contato encontrado
                    </td>
                  </tr>
                ) : (
                  contacts.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => setSelected(selected?.id === c.id ? null : c)}
                      className={clsx(
                        'hover:bg-gray-50 cursor-pointer transition-colors',
                        selected?.id === c.id && 'bg-brand-50 border-l-2 border-brand-600'
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-medium flex-shrink-0">
                            {c.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{c.name}</div>
                            {c.email && (
                              <div className="text-xs text-gray-400 flex items-center gap-1">
                                <Mail className="w-3 h-3" />{c.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                        {c.phone || '—'}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {c.tags?.map((tag) => (
                            <span key={tag} className="badge-blue text-xs">{tag}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="text-xs text-gray-500">
                          {c.utm_campaign || c.utm_source
                            ? `${c.utm_source || ''} / ${c.utm_campaign || ''}`
                            : '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden xl:table-cell">
                        {format(new Date(c.created_at), 'd MMM yyyy', { locale: ptBR })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-sm font-medium text-gray-700">{c.conversation_count ?? 0}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditing(c); setFormOpen(true); }}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                          title="Editar contato"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 50 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                className="btn-secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
              <span className="flex items-center text-sm text-gray-600">
                {page} / {Math.ceil(total / 50)}
              </span>
              <button
                className="btn-secondary"
                disabled={page >= Math.ceil(total / 50)}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Create/Edit modal */}
        {formOpen && (
          <ContactForm
            contact={editing}
            workspaceId={currentWorkspace.id}
            onClose={() => { setFormOpen(false); setEditing(undefined); }}
            onSave={(saved) => {
              setFormOpen(false);
              setEditing(undefined);
              if (editing) {
                setContacts(prev => prev.map(c => c.id === saved.id ? { ...c, ...saved } : c));
                if (selected?.id === saved.id) setSelected({ ...selected, ...saved });
              } else {
                setContacts(prev => [saved, ...prev]);
                setTotal(t => t + 1);
              }
            }}
          />
        )}

        {/* Contact detail panel */}
        {selected && (
          <ContactPanel
            contact={selected}
            workspaceId={currentWorkspace.id}
            onClose={() => setSelected(null)}
            onEdit={() => { setEditing(selected); setFormOpen(true); }}
          />
        )}
      </div>
    </>
  );
}

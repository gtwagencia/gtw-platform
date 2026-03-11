'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import type { Contact } from '@/types';
import { Search, Plus, Phone, Mail, Tag, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ContactsPage() {
  const { currentWorkspace } = useAuth();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total,    setTotal]    = useState(0);
  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [loading,  setLoading]  = useState(true);

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
          <button className="btn-primary text-sm">
            <Plus className="w-4 h-4" />
            Novo contato
          </button>
        }
      />

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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Deals</th>
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
                  <tr key={c.id} className="hover:bg-gray-50">
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
                      <span className="badge-gray">{c.deal_count ?? 0} deal{c.deal_count !== 1 ? 's' : ''}</span>
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
            </button>
          </div>
        )}
      </div>
    </>
  );
}

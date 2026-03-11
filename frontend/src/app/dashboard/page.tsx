'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import Header from '@/components/layout/Header';
import api from '@/lib/api';
import {
  MessageSquare, Users, TrendingUp, Inbox,
  CheckCircle, Clock, AlertCircle, ArrowRight,
} from 'lucide-react';
import Link from 'next/link';

interface Stats {
  openConversations:    number;
  resolvedToday:        number;
  totalContacts:        number;
  pendingDeals:         number;
}

export default function DashboardPage() {
  const { currentWorkspace } = useAuth();
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspace) { setLoading(false); return; }

    async function fetchStats() {
      try {
        const [convRes, contactRes, dealRes] = await Promise.all([
          api.get(`/workspaces/${currentWorkspace!.id}/conversations?limit=1`),
          api.get(`/workspaces/${currentWorkspace!.id}/contacts?limit=1`),
          api.get(`/workspaces/${currentWorkspace!.id}/kanban/deals`),
        ]);

        setStats({
          openConversations: convRes.data.total,
          resolvedToday:     0,
          totalContacts:     contactRes.data.total,
          pendingDeals:      dealRes.data.length,
        });
      } catch {
        setStats({ openConversations: 0, resolvedToday: 0, totalContacts: 0, pendingDeals: 0 });
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, [currentWorkspace]);

  if (!currentWorkspace) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Inbox className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Nenhum workspace selecionado</h2>
          <p className="text-gray-500 text-sm">
            Selecione ou crie um workspace para começar.
          </p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label:  'Conversas abertas',
      value:  stats?.openConversations ?? '—',
      icon:   MessageSquare,
      color:  'text-blue-600',
      bg:     'bg-blue-50',
      href:   '/dashboard/conversations',
    },
    {
      label:  'Total de contatos',
      value:  stats?.totalContacts ?? '—',
      icon:   Users,
      color:  'text-purple-600',
      bg:     'bg-purple-50',
      href:   '/dashboard/contacts',
    },
    {
      label:  'Deals no funil',
      value:  stats?.pendingDeals ?? '—',
      icon:   TrendingUp,
      color:  'text-green-600',
      bg:     'bg-green-50',
      href:   '/dashboard/kanban',
    },
    {
      label:  'Resolvidos hoje',
      value:  stats?.resolvedToday ?? '—',
      icon:   CheckCircle,
      color:  'text-orange-600',
      bg:     'bg-orange-50',
      href:   '/dashboard/conversations?status=resolved',
    },
  ];

  return (
    <>
      <Header title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-6">
        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">
            Bem-vindo ao {currentWorkspace.name}
          </h2>
          <p className="text-gray-500 mt-1 text-sm">Aqui está um resumo de hoje.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((s) => (
            <Link key={s.label} href={s.href}>
              <div className="card p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 ${s.bg} rounded-xl flex items-center justify-center`}>
                    <s.icon className={`w-5 h-5 ${s.color}`} />
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300" />
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {loading ? (
                    <div className="h-8 w-16 bg-gray-100 animate-pulse rounded" />
                  ) : s.value}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{s.label}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/dashboard/conversations" className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <MessageSquare className="w-5 h-5 text-brand-600" />
              <span className="font-medium text-gray-900">Atendimento</span>
            </div>
            <p className="text-sm text-gray-500">Gerencie conversas de WhatsApp e outros canais em tempo real.</p>
          </Link>

          <Link href="/dashboard/kanban" className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <span className="font-medium text-gray-900">Funil de Vendas</span>
            </div>
            <p className="text-sm text-gray-500">Acompanhe seus deals e mova-os pelo pipeline de forma visual.</p>
          </Link>

          <Link href="/dashboard/contacts" className="card p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-purple-600" />
              <span className="font-medium text-gray-900">CRM de Contatos</span>
            </div>
            <p className="text-sm text-gray-500">Base de clientes com rastreio de UTMs e dados do Meta Ads.</p>
          </Link>
        </div>
      </div>
    </>
  );
}

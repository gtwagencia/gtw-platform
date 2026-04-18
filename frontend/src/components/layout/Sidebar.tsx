'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useWorkspaceStore } from '@/store/workspace';
import clsx from 'clsx';
import {
  MessageSquare, Users, Kanban, Inbox, Settings,
  LogOut, ChevronDown, Building2, Home, User,
  Check, Plus, ArrowLeftRight, LayoutList, BarChart2, BookMarked, Tag, Ticket,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Workspace } from '@/types';

const navItems = [
  { href: '/dashboard',               icon: Home,          label: 'Início' },
  { href: '/dashboard/conversations', icon: MessageSquare, label: 'Conversas' },
  { href: '/dashboard/contacts',      icon: Users,         label: 'Contatos' },
  { href: '/dashboard/kanban',        icon: Kanban,        label: 'Funil' },
  { href: '/dashboard/tickets',       icon: Ticket,        label: 'Tickets' },
  { href: '/dashboard/inboxes',       icon: Inbox,         label: 'Inboxes' },
  { href: '/dashboard/members',       icon: Users,         label: 'Agentes' },
  { href: '/dashboard/departments',   icon: LayoutList,    label: 'Departamentos' },
  { href: '/dashboard/canned',        icon: BookMarked,    label: 'Respostas Prontas' },
  { href: '/dashboard/labels',        icon: Tag,           label: 'Etiquetas' },
  { href: '/dashboard/reports',       icon: BarChart2,     label: 'Relatórios' },
];

const bottomItems = [
  { href: '/dashboard/org',      icon: Building2, label: 'Organização' },
  { href: '/dashboard/settings', icon: Settings,  label: 'Configurações' },
  { href: '/dashboard/profile',  icon: User,      label: 'Perfil' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, currentOrg, currentWorkspace, setWorkspace } = useAuth();
  const { workspaces, fetchForOrg } = useWorkspaceStore();

  const [wsOpen, setWsOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentOrg) fetchForOrg(currentOrg.id);
  }, [currentOrg, fetchForOrg]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setWsOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleWorkspaceSwitch(ws: Workspace) {
    setWorkspace(ws);
    setWsOpen(false);
    router.push('/dashboard');
  }

  function isActive(href: string) {
    return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
  }

  return (
    <aside className="w-64 h-screen bg-gray-900 flex flex-col flex-shrink-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">GTW Platform</span>
        </div>
      </div>

      {/* Workspace switcher */}
      <div className="px-3 py-2 border-b border-gray-800" ref={dropRef}>
        <button
          onClick={() => setWsOpen(!wsOpen)}
          className="w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left
                     text-gray-300 hover:bg-gray-800 transition-colors"
        >
          <div className="w-7 h-7 rounded-md bg-brand-700 flex items-center justify-center
                          text-white text-xs font-bold flex-shrink-0">
            {currentWorkspace?.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-white truncate leading-tight">
              {currentWorkspace?.name}
            </div>
            <div className="text-xs text-gray-500 truncate leading-tight mt-0.5">
              {currentOrg?.name}
            </div>
          </div>
          <ChevronDown className={clsx('w-3.5 h-3.5 text-gray-500 transition-transform flex-shrink-0', wsOpen && 'rotate-180')} />
        </button>

        {wsOpen && (
          <div className="mt-1 rounded-xl bg-gray-800 border border-gray-700 shadow-xl overflow-hidden">
            <div className="p-1.5">
              <p className="text-xs text-gray-500 px-2 py-1 font-medium uppercase tracking-wider">
                {currentOrg?.name}
              </p>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => handleWorkspaceSwitch(ws)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left
                             text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <div className="w-6 h-6 rounded-md bg-gray-600 flex items-center justify-center
                                  text-white text-xs font-bold flex-shrink-0">
                    {ws.name[0]?.toUpperCase()}
                  </div>
                  <span className="flex-1 text-sm truncate">{ws.name}</span>
                  {ws.id === currentWorkspace?.id && (
                    <Check className="w-3.5 h-3.5 text-brand-400 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-gray-700 p-1.5">
              {(currentOrg?.role === 'owner' || currentOrg?.role === 'admin') && (
                <Link
                  href="/dashboard/org?tab=workspaces"
                  onClick={() => setWsOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm
                             text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Novo workspace
                </Link>
              )}
              <button
                onClick={() => { setWsOpen(false); router.push('/select'); }}
                className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm
                           text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
              >
                <ArrowLeftRight className="w-4 h-4" />
                Trocar organização
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-brand-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Bottom nav */}
      <div className="px-3 pb-2 space-y-0.5 border-t border-gray-800 pt-2">
        {bottomItems.map(({ href, icon: Icon, label }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive(href)
                ? 'bg-gray-800 text-white'
                : 'text-gray-500 hover:bg-gray-800 hover:text-gray-300'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </div>

      {/* User */}
      <div className="px-3 py-3 border-t border-gray-800">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center
                          text-white text-sm font-semibold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">{user?.name}</div>
            <div className="text-xs text-gray-500 truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => useAuth.getState().logout()}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

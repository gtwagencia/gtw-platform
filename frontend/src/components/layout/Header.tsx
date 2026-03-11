'use client';

import { useRef, useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useAuth } from '@/store/auth';
import { useNotifications } from '@/store/notifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import clsx from 'clsx';

interface HeaderProps {
  title:    string;
  actions?: React.ReactNode;
}

export default function Header({ title, actions }: HeaderProps) {
  const { currentWorkspace }                        = useAuth();
  const { notifications, unreadCount, markAllRead } = useNotifications();

  const [open, setOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen((v) => !v);
    if (!open && unreadCount > 0) markAllRead();
  }

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0 z-10">
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
        {currentWorkspace && (
          <p className="text-xs text-gray-400 truncate">{currentWorkspace.name}</p>
        )}
      </div>

      <div className="flex items-center gap-3 ml-4">
        {actions}

        {/* Notification bell */}
        <div className="relative" ref={dropRef}>
          <button
            onClick={handleOpen}
            className="relative p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100
                       rounded-lg transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs
                               rounded-full flex items-center justify-center font-medium leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl
                            border border-gray-200 overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <span className="font-semibold text-gray-900 text-sm">Notificações</span>
                {notifications.length > 0 && (
                  <button onClick={markAllRead} className="text-xs text-brand-600 hover:underline">
                    Marcar tudo como lido
                  </button>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                    <Bell className="w-8 h-8 text-gray-200 mb-3" />
                    <p className="text-sm text-gray-400">Nenhuma notificação ainda</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div
                      key={n.id}
                      className={clsx(
                        'px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors',
                        !n.read && 'bg-brand-50'
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <div className={clsx(
                          'w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                          n.type === 'new_conversation' ? 'bg-green-500' : 'bg-brand-500'
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 truncate">{n.body}</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDistanceToNow(n.createdAt, { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

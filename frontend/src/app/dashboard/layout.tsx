'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/store/auth';
import { useNotifications } from '@/store/notifications';
import Sidebar from '@/components/layout/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router      = useRouter();
  const { user, accessToken, currentWorkspace } = useAuth();
  const initSocket  = useNotifications((s) => s.initSocket);

  useEffect(() => {
    if (!accessToken || !user) {
      router.replace('/login');
      return;
    }
    if (!currentWorkspace) {
      router.replace('/select');
      return;
    }
    initSocket();
  }, [accessToken, user, currentWorkspace, router, initSocket]);

  if (!accessToken || !user || !currentWorkspace) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}

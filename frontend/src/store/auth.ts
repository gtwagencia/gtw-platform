import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, OrgSummary, Workspace } from '@/types';
import api from '@/lib/api';

interface AuthState {
  user:            User | null;
  currentOrg:      OrgSummary | null;
  currentWorkspace: Workspace | null;
  accessToken:     string | null;
  refreshToken:    string | null;

  login:           (email: string, password: string) => Promise<void>;
  register:        (name: string, email: string, password: string, orgName?: string) => Promise<void>;
  logout:          () => void;
  setOrg:          (org: OrgSummary) => void;
  setWorkspace:    (ws: Workspace) => void;
  fetchMe:         () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user:             null,
      currentOrg:       null,
      currentWorkspace: null,
      accessToken:      null,
      refreshToken:     null,

      login: async (email, password) => {
        const { data } = await api.post('/auth/login', { email, password });
        localStorage.setItem('accessToken',  data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        set({
          user:          data.user,
          accessToken:   data.accessToken,
          refreshToken:  data.refreshToken,
          currentOrg:    data.user.orgs[0] || null,
        });
      },

      register: async (name, email, password, orgName) => {
        const { data } = await api.post('/auth/register', { name, email, password, orgName });
        localStorage.setItem('accessToken',  data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        set({
          user:         data.user,
          accessToken:  data.accessToken,
          refreshToken: data.refreshToken,
          currentOrg:   data.user.orgs[0] || null,
        });
      },

      logout: () => {
        const rt = get().refreshToken;
        if (rt) api.post('/auth/logout', { refreshToken: rt }).catch(() => {});
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        set({ user: null, currentOrg: null, currentWorkspace: null, accessToken: null, refreshToken: null });
      },

      setOrg: (org) => set({ currentOrg: org, currentWorkspace: null }),
      setWorkspace: (ws) => set({ currentWorkspace: ws }),

      fetchMe: async () => {
        const { data } = await api.get('/auth/me');
        set({ user: data });
      },
    }),
    {
      name: 'gtw-auth',
      partialize: (s) => ({
        user: s.user,
        currentOrg: s.currentOrg,
        currentWorkspace: s.currentWorkspace,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
      }),
    }
  )
);

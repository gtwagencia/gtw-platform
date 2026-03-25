import { create } from 'zustand';
import api from '@/lib/api';
import type { Workspace } from '@/types';

interface WorkspaceState {
  workspaces:  Workspace[];
  loading:     boolean;
  error:       string | null;
  fetchForOrg: (orgId: string) => Promise<Workspace[]>;
  clear:       () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  loading:    false,
  error:      null,

  fetchForOrg: async (orgId) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.get(`/orgs/${orgId}/workspaces`);
      set({ workspaces: data });
      return data;
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? 'Erro ao carregar workspaces';
      set({ error: msg, workspaces: [] });
      return [];
    } finally {
      set({ loading: false });
    }
  },

  clear: () => set({ workspaces: [], error: null }),
}));

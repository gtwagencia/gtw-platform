import { create } from 'zustand';
import api from '@/lib/api';
import type { Workspace } from '@/types';

interface WorkspaceState {
  workspaces:  Workspace[];
  loading:     boolean;
  fetchForOrg: (orgId: string) => Promise<Workspace[]>;
  clear:       () => void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  loading:    false,

  fetchForOrg: async (orgId) => {
    set({ loading: true });
    try {
      const { data } = await api.get(`/orgs/${orgId}/workspaces`);
      set({ workspaces: data });
      return data;
    } finally {
      set({ loading: false });
    }
  },

  clear: () => set({ workspaces: [] }),
}));

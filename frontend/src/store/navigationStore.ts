import { create } from 'zustand';

type ViewMode = 'dashboard' | 'projects' | 'editor';

interface NavigationState {
  currentView: ViewMode;
  activeProjectId: number | null;
  navigateToDashboard: () => void;
  navigateToProjects: () => void;
  navigateToEditor: (projectId: number) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  currentView: 'dashboard',
  activeProjectId: null,
  navigateToDashboard: () => set({ currentView: 'dashboard', activeProjectId: null }),
  navigateToProjects: () => set({ currentView: 'projects', activeProjectId: null }),
  navigateToEditor: (projectId: number) => set({ currentView: 'editor', activeProjectId: projectId }),
}));

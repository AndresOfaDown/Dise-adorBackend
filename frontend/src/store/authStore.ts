import { create } from 'zustand';
import { type User, authApi } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  initAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: (() => {
    try {
      const stored = localStorage.getItem('uml_auth_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  })(),
  token: localStorage.getItem('uml_auth_token') || null,
  isAuthenticated: !!localStorage.getItem('uml_auth_token'),
  isLoading: false,

  setAuth: (user: User, token: string) => {
    localStorage.setItem('uml_auth_token', token);
    localStorage.setItem('uml_auth_user', JSON.stringify(user));
    set({ user, token, isAuthenticated: true, isLoading: false });
  },

  logout: () => {
    localStorage.removeItem('uml_auth_token');
    localStorage.removeItem('uml_auth_user');
    set({ user: null, token: null, isAuthenticated: false, isLoading: false });
  },

  initAuth: async () => {
    const token = localStorage.getItem('uml_auth_token');
    if (!token) {
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
      return;
    }

    try {
      set({ isLoading: true });
      const data = await authApi.getMe();
      set({ user: data.user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('uml_auth_token');
      localStorage.removeItem('uml_auth_user');
      set({ user: null, token: null, isAuthenticated: false, isLoading: false });
    }
  },
}));

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, AuthState, LoginCredentials } from '../types/auth';
import authService from '../services/authService';
import { hospitalService } from '../services/hospitalService';

interface AuthContextType extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (partial: Partial<User>) => void;
  /** Check if the current user has the given permission (module:action:resource). */
  hasPermission: (permission: string) => boolean;
  /** Check if the current user has any of the given roles. */
  hasRole: (...roles: string[]) => boolean;
  /** List of modules enabled for the current tenant. */
  enabledModules: string[];
  /** Check if a module is enabled for the current tenant. */
  isModuleEnabled: (moduleCode: string) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: authService.getStoredUser(),
    token: authService.getStoredToken(),
    isAuthenticated: authService.isAuthenticated(),
    isLoading: false,
  });
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  const fetchModules = useCallback(async () => {
    if (state.isAuthenticated && !state.user?.roles.includes('super_admin')) {
      const modules = await hospitalService.getEnabledModules();
      setEnabledModules(modules);
    } else if (state.user?.roles.includes('super_admin')) {
      // Super admins see all modules
      setEnabledModules([
        'patients', 'appointments', 'prescriptions', 'pharmacy',
        'optical', 'billing', 'inventory', 'analytics',
      ]);
    }
  }, [state.isAuthenticated, state.user]);

  // Run once whenever auth state changes (login / logout)
  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  // Re-fetch when the hospital admin switches back to this tab so any
  // module changes made by a SuperAdmin in another tab take effect immediately.
  useEffect(() => {
    if (!state.isAuthenticated || state.user?.roles.includes('super_admin')) return;
    const handleFocus = () => fetchModules();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [state.isAuthenticated, state.user, fetchModules]);

  const login = useCallback(async (credentials: LoginCredentials) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      const response = await authService.login(credentials);
      setState({
        user: response.user,
        token: response.access_token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }));
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
    setEnabledModules([]);
  }, []);

  // Patch the in-memory user and keep localStorage in sync (e.g. after photo upload)
  const updateUser = useCallback((partial: Partial<User>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updated = { ...prev.user, ...partial };
      localStorage.setItem('user', JSON.stringify(updated));
      return { ...prev, user: updated };
    });
  }, []);

  // Sync with localStorage changes (e.g., 401 interceptor)
  const hasPermission = useCallback(
    (permission: string): boolean => {
      if (!state.user) return false;
      // super_admin bypasses all permission checks
      if (state.user.roles.includes('super_admin')) return true;
      return (state.user.permissions ?? []).includes(permission);
    },
    [state.user],
  );

  const hasRole = useCallback(
    (...roles: string[]): boolean => {
      if (!state.user) return false;
      return roles.some(r => state.user!.roles.includes(r));
    },
    [state.user],
  );

  const isModuleEnabled = useCallback(
    (moduleCode: string): boolean => {
      if (state.user?.roles.includes('super_admin')) return true;
      return enabledModules.includes(moduleCode);
    },
    [state.user, enabledModules],
  );

  // Sync when another tab clears localStorage (e.g. 401 interceptor)
  useEffect(() => {
    const handleStorage = () => {
      const token = authService.getStoredToken();
      if (!token && state.isAuthenticated) {
        setState({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
        });
        setEnabledModules([]);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [state.isAuthenticated]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser, hasPermission, hasRole, enabledModules, isModuleEnabled }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { User, AuthState, LoginCredentials } from '../types/auth';
import authService from '../services/authService';
import { hospitalService } from '../services/hospitalService';
import api from '../services/api';
import { setActiveTimeZone } from '../utils/calendarDate';
import rolePermissionService from '../services/rolePermissionService';
import { setEffectiveMatrix } from '../config/modulePermissions';

// The public Queue Display kiosk (/public/queue/:code) is intentionally
// unauthenticated and standalone — it must never trigger auth/tenant calls
// like GET /tenant/modules, even when the browser also happens to hold a
// stale token from a previous logged-in session in the same profile.
const isPublicRoute = (pathname: string) => pathname.startsWith('/public/');

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
  /**
   * True when the current hospital is classified eye_hospital/multi_specialty —
   * gates the whole BRD v1.1 feature pack (Patient History block, Queue
   * Display, Prescription Opthal toggle + dual letterhead, Pharmacy Queue +
   * payment tracking, Optical/Opthal Billing). Super admins always pass.
   */
  isEyeHospitalFeatureEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const [state, setState] = useState<AuthState>({
    user: authService.getStoredUser(),
    token: authService.getStoredToken(),
    isAuthenticated: authService.isAuthenticated(),
    isLoading: false,
  });
  const [enabledModules, setEnabledModules] = useState<string[]>([]);
  // Bumped whenever the effective permission matrix (module-level variable in
  // modulePermissions.ts) is (re)set. setEffectiveMatrix() itself isn't React
  // state, so nothing would otherwise force AuthContext's consumers (route
  // gating in App.tsx, nav gating in Layout.tsx, etc.) to re-render and pick
  // up a freshly-fetched matrix — this state bump is what makes that happen
  // deterministically, instead of accidentally piggybacking on enabledModules
  // updates landing at the right moment.
  const [matrixVersion, setMatrixVersion] = useState(0);

  // Every timestamp in the app should render in the logged-in user's HOSPITAL
  // timezone (set at hospital creation / in Hospital Settings), not whatever
  // timezone the viewer's own device happens to be on — a clinic's schedule
  // is fixed to its own local time regardless of where staff are logging in
  // from. calendarDate.ts's formatters read this module-level value as their
  // default so every screen converts the same way without prop-drilling it
  // through every call site.
  useEffect(() => {
    setActiveTimeZone(state.user?.hospital_timezone);
  }, [state.user?.hospital_timezone]);

  const fetchModules = useCallback(async () => {
    if (!state.isAuthenticated || isPublicRoute(location.pathname)) return;

    if (state.user?.roles.includes('super_admin')) {
      // Fetch all system modules dynamically so new modules are auto-included
      try {
        const response = await api.get<{ code: string }[]>('/superadmin/modules');
        const codes = response.data.map(m => m.code);
        setEnabledModules(codes.length ? codes : [
          'patients', 'appointments', 'prescriptions', 'pharmacy',
          'optical', 'billing', 'inventory', 'analytics',
        ]);
      } catch {
        setEnabledModules([
          'patients', 'appointments', 'prescriptions', 'pharmacy',
          'optical', 'billing', 'inventory', 'analytics',
        ]);
      }
    } else {
      const modules = await hospitalService.getEnabledModules();
      setEnabledModules(modules);
    }
  }, [state.isAuthenticated, state.user, location.pathname]);

  // Fetch this hospital's effective Roles & Permissions matrix once per
  // login — same lifecycle as fetchModules above. super_admin bypasses every
  // permission check already (see getAccess/hasAccess), so there's nothing
  // to fetch for that role.
  const fetchPermissionMatrix = useCallback(async () => {
    if (!state.isAuthenticated || isPublicRoute(location.pathname)) return;
    if (state.user?.roles.includes('super_admin')) {
      setEffectiveMatrix(null);
      setMatrixVersion(v => v + 1);
      return;
    }
    try {
      const matrix = await rolePermissionService.getMatrix();
      setEffectiveMatrix(matrix);
    } catch {
      // Fall back to the static default matrix rather than blocking the app.
      setEffectiveMatrix(null);
    } finally {
      setMatrixVersion(v => v + 1);
    }
  }, [state.isAuthenticated, state.user, location.pathname]);

  // Run once whenever auth state changes (login / logout)
  useEffect(() => {
    fetchModules();
    fetchPermissionMatrix();
  }, [fetchModules, fetchPermissionMatrix]);

  // Re-fetch when the hospital admin switches back to this tab so any
  // module changes made by a SuperAdmin in another tab take effect immediately.
  useEffect(() => {
    if (!state.isAuthenticated || state.user?.roles.includes('super_admin')) return;
    const handleFocus = () => { fetchModules(); fetchPermissionMatrix(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [state.isAuthenticated, state.user, fetchModules, fetchPermissionMatrix]);

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
    setEffectiveMatrix(null);
    setMatrixVersion(v => v + 1);
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
      // Case/whitespace-insensitive — mirrors the backend's _has_role
      // normalization (dependencies.py) and ProtectedRoute's matching.
      const normalizedRoles = roles.map(r => r.trim().toLowerCase());
      return state.user.roles.some(r => normalizedRoles.includes(r.trim().toLowerCase()));
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

  const isEyeHospitalFeatureEnabled =
    state.user?.roles.includes('super_admin') ||
    state.user?.hospital_specialty === 'eye_hospital' ||
    state.user?.hospital_specialty === 'multi_specialty' ||
    false;

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
        setEffectiveMatrix(null);
        setMatrixVersion(v => v + 1);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [state.isAuthenticated]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, updateUser, hasPermission, hasRole, enabledModules, isModuleEnabled, isEyeHospitalFeatureEnabled }}>
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

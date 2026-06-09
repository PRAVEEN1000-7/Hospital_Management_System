import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { superAdminApi } from '../services/superAdminApi';

interface SuperAdmin {
  id: string;
  username: string;
  email: string;
  full_name: string;
  is_active: boolean;
}

interface SuperAdminContextType {
  admin: SuperAdmin | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<boolean>;
}

const SuperAdminContext = createContext<SuperAdminContextType | undefined>(undefined);

export const SuperAdminProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [admin, setAdmin] = useState<SuperAdmin | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    const token = localStorage.getItem('access_token');
    
    if (!token) {
      setIsLoading(false);
      return false;
    }

    try {
      const response = await superAdminApi.getMe();
      setAdmin(response.data);
      return true;
    } catch (error) {
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    // This is no longer used by the UI as we use the main login
    // but keeping the logic consistent just in case
    const response = await superAdminApi.login({ username, password });
    const { access_token, user } = response.data;
    
    localStorage.setItem('access_token', access_token);
    setAdmin(user);
  };

  const logout = () => {
    localStorage.removeItem('access_token');
    setAdmin(null);
  };

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <SuperAdminContext.Provider
      value={{
        admin,
        isAuthenticated: !!admin,
        isLoading,
        login,
        logout,
        checkAuth,
      }}
    >
      {children}
    </SuperAdminContext.Provider>
  );
};

export const useSuperAdmin = () => {
  const context = useContext(SuperAdminContext);
  if (context === undefined) {
    throw new Error('useSuperAdmin must be used within SuperAdminProvider');
  }
  return context;
};

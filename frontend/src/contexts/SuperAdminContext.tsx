import React, { createContext, useContext, useState, useCallback } from 'react';
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
    const token = localStorage.getItem('superadmin_token');
    if (!token) {
      setIsLoading(false);
      return false;
    }

    try {
      const response = await superAdminApi.getMe();
      setAdmin(response.data);
      return true;
    } catch (error) {
      localStorage.removeItem('superadmin_token');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = async (username: string, password: string) => {
    const response = await superAdminApi.login({ username, password });
    const { access_token, user } = response.data;
    
    localStorage.setItem('superadmin_token', access_token);
    setAdmin(user);
  };

  const logout = () => {
    localStorage.removeItem('superadmin_token');
    setAdmin(null);
  };

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

'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserRole, UserDto } from '@load-shedding/shared';
import { ApiClient } from './api';

interface AuthContextType {
  user: UserDto | null;
  token: string | null;
  loading: boolean;
  login: (token: string, user: UserDto) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {}
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');

    if (savedToken && savedUser) {
      setToken(savedToken);
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('auth_user');
      }
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: UserDto) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('auth_token', newToken);
    localStorage.setItem('auth_user', JSON.stringify(newUser));
  };

  const logout = async () => {
    try {
      await ApiClient.post('/api/auth/logout');
    } catch {
      // Ignore network errors on logout
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    if (!token) return;
    const res = await ApiClient.get('/api/users/me');
    if (res.success && res.data) {
      setUser(res.data);
      localStorage.setItem('auth_user', JSON.stringify(res.data));
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

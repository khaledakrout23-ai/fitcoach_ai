import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const refresh = useCallback(async () => {
    const me = await api('/auth/me');
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    refresh()
      .catch(() => logout())
      .finally(() => setLoading(false));
  }, [refresh, logout]);

  async function login(email, password) {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    return refresh();
  }

  // l'inscription ne connecte pas : un code est envoyé par e-mail (voir verifyEmail)
  async function register(values) {
    return api('/auth/register', { method: 'POST', body: values });
  }

  async function verifyEmail(email, code) {
    const data = await api('/auth/verify-email', { method: 'POST', body: { email, code } });
    setToken(data.token);
    return refresh();
  }

  async function resetPassword(email, code, password) {
    const data = await api('/auth/reset-password', { method: 'POST', body: { email, code, password } });
    setToken(data.token);
    return refresh();
  }

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, verifyEmail, resetPassword, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// Page d'accueil selon le rôle
export function homeFor(role) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'GERANT') return '/gerant';
  return '/app';
}

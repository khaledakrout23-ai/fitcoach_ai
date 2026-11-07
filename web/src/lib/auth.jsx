import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, onApiEvent } from './api';
import { useI18n } from './i18n';
import { useTheme } from './theme';
import { isStaff } from './permissions';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();
  const { setTheme } = useTheme();

  // la langue et le thème du compte s'appliquent dès la connexion
  const setUser = useCallback(
    (next) => {
      setUserState(next);
      if (next?.language) setLang(next.language);
      if (next?.theme) setTheme(next.theme);
    },
    [setLang, setTheme]
  );

  const refresh = useCallback(async () => {
    try {
      const me = await api.get('/auth/me');
      setUser(me);
      return me;
    } catch (err) {
      if (err.status === 401) {
        setUserState(null);
        return null;
      }
      throw err;
    }
  }, [setUser]);

  useEffect(() => {
    refresh()
      .catch(() => setUserState(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  // session expirée ailleurs (autre onglet, compte désactivé) → retour à la connexion
  useEffect(
    () =>
      onApiEvent((type) => {
        if (type === 'unauthorized') setUserState(null);
        if (type === 'password-change-required') setUserState((u) => (u ? { ...u, mustChangePassword: true } : u));
      }),
    []
  );

  const value = useMemo(
    () => ({
      user,
      loading,
      setUser,
      refresh,
      // remember = false : session courte (PC partagé de l'accueil)
      async login(identifier, password, remember = true) {
        const me = await api.post('/auth/login', { identifier, password, remember });
        setUser(me);
        return me;
      },
      async firstPassword(currentPassword, newPassword) {
        const me = await api.post('/auth/first-password', { currentPassword, newPassword });
        setUser(me);
        return me;
      },
      async logout(everywhere = false) {
        try {
          await api.post('/auth/logout', { everywhere });
        } finally {
          // réponses de l'onboarding gardées dans l'onglet (données de santé) : effacées à la déconnexion
          try {
            sessionStorage.removeItem('kammel_onboarding');
          } catch {
            /* stockage indisponible */
          }
          setUserState(null);
        }
      },
    }),
    [user, loading, setUser, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Première page après la connexion, selon le rôle et l'état du compte */
export function homeFor(user) {
  if (!user) return '/bienvenue';
  if (user.mustChangePassword) return '/premiere-connexion';
  if (user.role === 'ADMIN') return '/admin';
  if (isStaff(user)) return '/salle';
  return user.onboardedAt ? '/app' : '/onboarding';
}

/** Page de connexion selon le rôle (membres : téléphone ; équipe : e-mail) */
export function loginPathFor(role) {
  return role && role !== 'SPORTIF' ? '/salle/connexion' : '/connexion';
}

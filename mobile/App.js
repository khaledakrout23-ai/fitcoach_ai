import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { api, loadToken, setToken } from './src/api';
import { AuthContext, NavContext } from './src/context';
import { I18nProvider, useI18n } from './src/i18n';
import { colors } from './src/theme';
import { Loading } from './src/ui';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import ProgramScreen from './src/screens/ProgramScreen';
import SessionScreen from './src/screens/SessionScreen';
import ExerciseScreen from './src/screens/ExerciseScreen';
import CoachScreen from './src/screens/CoachScreen';
import ProgressScreen from './src/screens/ProgressScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import WebPanelScreen from './src/screens/WebPanelScreen';
import MealsScreen from './src/screens/MealsScreen';

// Navigation simple : 6 onglets + une pile d'écrans (séance, fiche exercice)
const TABS = [
  ['home', 'nav.home', HomeScreen],
  ['program', 'nav.program', ProgramScreen],
  ['meals', 'nav.meals', MealsScreen],
  ['coach', 'nav.coach', CoachScreen],
  ['progress', 'nav.progress', ProgressScreen],
  ['profile', 'nav.profile', ProfileScreen],
];
const STACK = { session: SessionScreen, exercise: ExerciseScreen };

function Main() {
  const { t, row } = useI18n();
  const [tab, setTab] = useState('home');
  const [stack, setStack] = useState([]);

  const nav = {
    push: (name, params = {}) => setStack((s) => [...s, { name, params }]),
    back: () => setStack((s) => s.slice(0, -1)),
    reset: (nextTab) => {
      setStack([]);
      if (nextTab) setTab(nextTab);
    },
  };

  // bouton « retour » d'Android
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stack.length) {
        setStack((s) => s.slice(0, -1));
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [stack.length]);

  const top = stack[stack.length - 1];
  const Current = top ? STACK[top.name] : TABS.find(([key]) => key === tab)[2];

  return (
    <NavContext.Provider value={nav}>
      <View style={{ flex: 1 }}>
        <Current key={top ? `${top.name}-${stack.length}` : tab} params={top?.params || {}} />
      </View>
      {!top && (
        <View style={[styles.tabbar, { flexDirection: row }]}>
          {TABS.map(([key, label]) => (
            <Pressable key={key} style={styles.tab} onPress={() => setTab(key)} accessibilityRole="tab" accessibilityState={{ selected: tab === key }}>
              <View style={[styles.tabDot, tab === key && { backgroundColor: colors.brand }]} />
              <Text style={[styles.tabText, tab === key && { color: colors.brand, fontWeight: '700' }]} numberOfLines={1}>
                {t(label)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </NavContext.Provider>
  );
}

function Root() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const { setLang } = useI18n();

  const refresh = useCallback(async () => {
    const me = await api('/auth/me');
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    loadToken()
      .then((tok) => (tok ? refresh() : null))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const auth = {
    user,
    setUser,
    refresh,
    async login(email, password) {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      await setToken(data.token);
      const me = await refresh();
      setLang(me.language);
    },
    // l'inscription ne connecte pas : un code est envoyé par e-mail (voir verifyEmail)
    async register(values) {
      return api('/auth/register', { method: 'POST', body: values });
    },
    async verifyEmail(email, code) {
      const data = await api('/auth/verify-email', { method: 'POST', body: { email, code } });
      await setToken(data.token);
      await refresh();
    },
    async resetPassword(email, code, password) {
      const data = await api('/auth/reset-password', { method: 'POST', body: { email, code, password } });
      await setToken(data.token);
      await refresh();
    },
    async logout() {
      await setToken(null);
      setUser(null);
    },
  };

  return (
    <AuthContext.Provider value={auth}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <StatusBar style="dark" />
        {loading ? <Loading /> : !user ? <LoginScreen /> : user.role === 'SPORTIF' ? <Main /> : <WebPanelScreen />}
      </SafeAreaView>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <Root />
      </I18nProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  tabbar: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line, paddingBottom: 6 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, gap: 4 },
  tabDot: { width: 18, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  tabText: { fontSize: 11, color: colors.muted },
});

import { useEffect, useRef, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { takePhoto as takeNativePhoto } from '../camera';
import { WEB_URL, getToken } from '../api';
import { useAuth } from '../context';
import { useI18n } from '../i18n';
import { colors } from '../theme';
import { Loading } from '../ui';

// Gérants et administrateurs : on affiche le site web dans l'application, déjà connecté
export default function WebPanelScreen() {
  const { user, logout } = useAuth();
  const { lang, t } = useI18n();
  const web = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);

  // bouton « retour » d'Android : page précédente du site
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false;
      web.current.goBack();
      return true;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Le site demande une photo (bouton « Prendre une photo ») : on ouvre l'appareil photo du téléphone
  // et on renvoie l'image (max 1024 px, JPEG) au site par l'événement « nativePhoto »
  async function takePhoto() {
    const send = (detail) =>
      web.current.injectJavaScript(`window.dispatchEvent(new CustomEvent('nativePhoto', { detail: ${JSON.stringify(detail)} })); true;`);
    try {
      return send({ image: await takeNativePhoto() });
    } catch (err) {
      return send({ error: err.code === 'CAMERA_DENIED' ? 'CAMERA_DENIED' : 'CAMERA_ERROR' });
    }
  }

  // le site lit le jeton et la langue dans localStorage avant de démarrer
  const inject = `
    localStorage.setItem('fitcoach_token', ${JSON.stringify(getToken())});
    localStorage.setItem('fitcoach_lang', ${JSON.stringify(lang)});
    true;`;

  if (failed) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 8 }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: colors.ink }}>{t('err.NETWORK')}</Text>
        <Text style={{ color: colors.muted }}>{WEB_URL}</Text>
        <Text style={{ color: colors.muted }}>{t('mobile.serverHint')}</Text>
        <Text style={{ color: colors.brand, fontWeight: '700', marginTop: 12 }} onPress={logout}>
          {t('nav.logout')}
        </Text>
      </View>
    );
  }

  return (
    <WebView
      ref={web}
      source={{ uri: `${WEB_URL}/${user.role === 'ADMIN' ? 'admin' : 'gerant'}` }}
      injectedJavaScriptBeforeContentLoaded={inject}
      startInLoadingState
      renderLoading={() => <Loading />}
      onError={() => setFailed(true)}
      onNavigationStateChange={(s) => {
        setCanGoBack(s.canGoBack);
        // déconnexion depuis le site : on revient à l'écran de connexion de l'application
        if (/\/connexion/.test(s.url)) logout();
      }}
      onMessage={(e) => {
        if (e.nativeEvent.data === 'takePhoto') takePhoto();
      }}
      mediaCapturePermissionGrantType="grant"
      allowFileAccess
    />
  );
}

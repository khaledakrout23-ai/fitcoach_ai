import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { WebView } from 'react-native-webview';
import { api } from './api';
import { useI18n } from './i18n';
import { colors } from './theme';
import { Loading, useLoad } from './ui';

// Page HTML locale servie avec une origine https : YouTube refuse les lecteurs intégrés sans « referer »
const ORIGIN = 'https://fitcoach.tn';
const playerHtml = (videoId) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style>
</head><body>
<iframe src="https://www.youtube-nocookie.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(ORIGIN)}"
  allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body></html>`;

/**
 * Vidéo YouTube de démonstration d'un exercice, lue dans l'application.
 * @param {{ exercise: object, onClose?: () => void }} props
 */
export default function VideoFrame({ exercise, onClose }) {
  const { t, name, text } = useI18n();
  const { width } = useWindowDimensions();
  const video = useLoad(() => api(`/exercises/${exercise.id}/video`), [exercise.id]);
  const height = Math.round((width * 9) / 16);
  const videoId = video.data?.videoId;

  return (
    <View style={{ backgroundColor: colors.ink }}>
      <View style={{ height, backgroundColor: '#000', justifyContent: 'center' }}>
        {video.loading ? (
          <Loading />
        ) : videoId ? (
          <WebView
            key={videoId}
            source={{ html: playerHtml(videoId), baseUrl: ORIGIN }}
            style={{ backgroundColor: '#000' }}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            // on reste dans l'application : seul le lecteur intégré peut se charger
            onShouldStartLoadWithRequest={(req) => req.isTopFrame === false || req.url.startsWith(ORIGIN) || req.url === 'about:blank'}
          />
        ) : (
          <Text style={{ color: '#fff', textAlign: 'center', padding: 16 }}>{t('mobile.noVideo')}</Text>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 10 }}>
        <Text style={[{ flex: 1, color: '#fff', fontWeight: '700' }, text]} numberOfLines={1}>
          ▶ {name(exercise)}
        </Text>
        {onClose && (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('mobile.closeVideo')} hitSlop={10}>
            <Text style={{ color: colors.signal, fontWeight: '700' }}>{t('mobile.closeVideo')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

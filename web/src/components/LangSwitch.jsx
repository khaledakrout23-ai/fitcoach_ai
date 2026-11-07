import { useI18n, LANGS } from '../lib/i18n';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

/** FR · ع · EN (en haut des écrans d'accueil et de connexion). Connecté : la langue est enregistrée sur le compte. */
export default function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  const { user } = useAuth();
  const choose = (l) => {
    setLang(l);
    if (user && user.language !== l) api.put('/me/profile', { language: l }).catch(() => {});
  };
  return (
    <div className="segmented lang-switch" role="group" aria-label={t('lang.' + lang)}>
      {LANGS.map((l) => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => choose(l)} lang={l} aria-label={t(`lang.${l}`)}>
          {t(`lang.short.${l}`)}
        </button>
      ))}
    </div>
  );
}

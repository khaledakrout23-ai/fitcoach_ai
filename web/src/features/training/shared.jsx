// Éléments partagés par les écrans Entraînement, Historique, Fiche exercice et Séance
import { useState } from 'react';
import { Icon, IconButton, Num } from '../../components';
import { api } from '../../lib/api';
import { useLoad, useOnline } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';

// /api/meta (libellés des muscles, mouvements, zones de douleur) : chargé une fois pour toute l'app
let metaPromise = null;
function loadMeta() {
  if (!metaPromise) {
    metaPromise = api.get('/meta').catch((err) => {
      metaPromise = null;
      throw err;
    });
  }
  return metaPromise;
}

/** Listes de référence ; null pendant le chargement (les écrans affichent alors les codes bruts) */
export function useMeta() {
  const { data } = useLoad(() => loadMeta().catch(() => null), []);
  return data;
}

/** Libellé traduit d'un muscle / mouvement / zone : meta.muscles.pectoraux → « Pectoraux » */
export function useMetaLabel() {
  const meta = useMeta();
  const { label } = useI18n();
  return (group, key) => {
    const entry = meta && meta[group] ? meta[group][key] : null;
    return entry ? label(entry) : key;
  };
}

/** Premier nombre d'une consigne de répétitions (« 8-12 » → 8, « 30s » → 30) */
export function firstNumber(text) {
  const n = parseInt(String(text ?? ''), 10);
  return Number.isNaN(n) ? null : n;
}

/** Consigne chronométrée (« 30s ») */
export const isTimed = (reps) => /s$/i.test(String(reps || '').trim());

/** Titre d'un jour : « Push — Pectoraux & Triceps » (seulement si 1 ou 2 muscles, sinon le libellé seul) */
export function useDayTitle() {
  const { name } = useI18n();
  const metaLabel = useMetaLabel();
  return (day, muscles = []) => {
    const label = name(day, 'label') || name(day, 'dayLabel');
    if (!muscles.length || muscles.length > 2) return label;
    return `${label} — ${muscles.map((m) => metaLabel('muscles', m)).join(' & ')}`;
  };
}

/** Liste lisible : « mercredi, vendredi et dimanche » */
export function listFormat(lang, items) {
  try {
    return new Intl.ListFormat(lang === 'ar' ? 'ar' : lang === 'en' ? 'en-GB' : 'fr-FR', { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** « 4 × 8 · 60 kg » (charge facultative) */
export function SetsLine({ sets, reps, kg }) {
  const { t, fmt } = useI18n();
  return (
    <>
      <Num>
        {sets} × {reps}
      </Num>
      {kg != null && Number(kg) > 0 ? (
        <>
          {' · '}
          <Num>{fmt.kg(kg)}</Num>
        </>
      ) : null}
      {kg != null && Number(kg) === 0 ? ` · ${t('training.bodyweight')}` : null}
    </>
  );
}

/** Vignette d'exercice (pas d'image dans le catalogue : icône selon le matériel) */
export function ExerciseThumb({ exercise, size = 'md' }) {
  const category = exercise?.equipment?.category;
  const icon = category === 'POIDS_DU_CORPS' ? 'activity' : category === 'MACHINE' ? 'settings' : 'dumbbell';
  return (
    <span className={`ex-thumb ${size}`} aria-hidden="true">
      <Icon name={icon} size={size === 'sm' ? 18 : 22} />
    </span>
  );
}

/** Machine de la salle utilisable pour l'exercice (en service d'abord) */
export function pickMachine(exercise) {
  const list = exercise?.machines || [];
  return list.find((m) => m.status === 'OK' && !m.outOfService) || list.find((m) => !m.outOfService) || null;
}

/** « Chest Press #04 · Zone machines » ou le nom du matériel */
export function useMachineLine() {
  const { name } = useI18n();
  return (exercise) => {
    const m = pickMachine(exercise);
    if (m) return [m.label, m.code ? `#${m.code}` : null].filter(Boolean).join(' ') + (m.zone ? ` · ${m.zone}` : '');
    return exercise?.equipment ? name(exercise.equipment) : '';
  };
}

// Identifiant YouTube strict : 11 caractères [A-Za-z0-9_-]
const YT_ID = /^[\w-]{11}$/;

/** Recherche YouTube (nouvel onglet) quand aucune vidéo intégrable n'est trouvée */
export function youtubeSearchUrl(exercise) {
  const q = `${exercise?.nameEn || exercise?.nameFr || ''} exercise proper form`;
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
}

/**
 * Carte vidéo : affiche d'abord un aperçu, la vidéo n'est chargée qu'au clic (données mobiles, vie privée).
 * Lecteur youtube-nocookie uniquement ; sinon bouton « Voir sur YouTube ».
 */
export function VideoCard({ exercise, onInfo }) {
  const { t, name } = useI18n();
  const online = useOnline();
  const [state, setState] = useState({ status: 'idle', videoId: null });

  async function play() {
    setState({ status: 'loading', videoId: null });
    try {
      const res = await api.get(`/exercises/${exercise.id}/video`);
      const id = res && typeof res.videoId === 'string' && YT_ID.test(res.videoId) ? res.videoId : null;
      setState({ status: id ? 'playing' : 'none', videoId: id });
    } catch {
      setState({ status: 'none', videoId: null });
    }
  }

  if (state.status === 'playing') {
    return (
      <div className="video-card playing">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${state.videoId}?autoplay=1&rel=0&playsinline=1&modestbranding=1`}
          title={t('training.videoOf', { name: name(exercise) })}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
        />
      </div>
    );
  }

  return (
    <div className="video-card">
      <span className="video-caption small">{t('training.videoOf', { name: name(exercise) })}</span>
      {onInfo ? <IconButton icon="info" label={t('training.openSheet')} className="video-info" onClick={onInfo} /> : null}
      {state.status === 'none' || !online ? (
        <div className="video-fallback stack-2">
          <span className="small muted">{online ? t('training.videoNone') : t('training.videoOffline')}</span>
          {online ? (
            <a className="btn secondary sm" href={youtubeSearchUrl(exercise)} target="_blank" rel="noopener noreferrer">
              <Icon name="external-link" size={18} />
              {t('training.videoSearch')}
            </a>
          ) : null}
        </div>
      ) : (
        <button type="button" className="video-play" onClick={play} aria-label={t('training.videoPlay')} disabled={state.status === 'loading'}>
          {state.status === 'loading' ? <span className="spin" aria-hidden="true" /> : <Icon name="play" size={28} fill />}
        </button>
      )}
    </div>
  );
}

/** Note en étoiles (lecture seule) */
export function Stars({ value, size = 14 }) {
  const { t } = useI18n();
  if (!value) return null;
  return (
    <span className="stars" role="img" aria-label={t('training.rating', { n: value })}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={size} fill={i <= value} className={i <= value ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Bouton retour d'un écran plein : historique du navigateur si possible, sinon chemin de repli */
export function BackButton({ fallback, navigate, location }) {
  const { t } = useI18n();
  return (
    <IconButton
      icon="arrow-left"
      label={t('action.back')}
      onClick={() => (location.key !== 'default' ? navigate(-1) : navigate(fallback))}
    />
  );
}

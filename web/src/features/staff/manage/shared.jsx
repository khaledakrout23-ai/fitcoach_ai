// Briques partagées par les écrans de gestion de la salle, du contenu et de l'administration Kammel
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { Button, IconButton, Icon, StatusPill, useToast } from '../../../components';
import './manage.css';

// Libellés de /api/meta (muscles, zones de douleur, types de panne…) : chargés une seule fois
let metaPromise = null;
export function useMeta() {
  return useLoad(() => {
    if (!metaPromise) {
      metaPromise = api.get('/meta').catch((err) => {
        metaPromise = null;
        throw err;
      });
    }
    return metaPromise;
  }, []);
}

/** true si la requête média correspond (ex. '(min-width: 1100px)') */
export function useMedia(query) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** En-tête de page : titre, sous-titre, actions ; flèche retour sur téléphone (pages ouvertes depuis « Plus ») */
export function PageHead({ title, subtitle, back, actions }) {
  const { t } = useI18n();
  return (
    <header className="page-head mg-head">
      {back ? <IconButton icon="arrow-left" label={t('action.back')} to={back} className="phone-only no-print" /> : null}
      <div className="titles">
        <h1>{title}</h1>
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="actions no-print">{actions}</div> : null}
    </header>
  );
}

/** « Tirage vertical #09 » */
export function machineName(m) {
  if (!m) return '';
  return m.code ? `${m.label} #${m.code}` : m.label;
}

/** Vignette carrée avec une icône (pas de photo de machine en base) */
export function Thumb({ icon = 'dumbbell', src, alt = '' }) {
  return <span className="mg-thumb">{src ? <img src={src} alt={alt} loading="lazy" /> : <Icon name={icon} size={20} />}</span>;
}

const MACHINE_TONE = { OK: ['ok', 'circle-check'], SIGNALEE: ['danger', 'triangle-alert'], REPARATION: ['warn', 'wrench'] };
export function MachineStatus({ status }) {
  const { t } = useI18n();
  const [tone, icon] = MACHINE_TONE[status] || ['', 'circle'];
  return (
    <StatusPill tone={tone} icon={icon}>
      {t(`manage.machineStatus.${status}`)}
    </StatusPill>
  );
}

const REPORT_TONE = { NOUVEAU: ['danger', 'circle-alert'], VU: ['ember', 'eye'], REPARATION: ['warn', 'wrench'], REPAREE: ['ok', 'circle-check'], REJETE: ['', 'x'] };
export function ReportStatus({ status }) {
  const { t } = useI18n();
  const [tone, icon] = REPORT_TONE[status] || ['', 'circle'];
  return (
    <StatusPill tone={tone} icon={icon}>
      {t(`manage.reportStatus.${status}`)}
    </StatusPill>
  );
}

/**
 * Mot de passe provisoire renvoyé une seule fois par l'API : affiché avec un bouton « Copier », jamais stocké.
 */
export function TempPassword({ login, password, expiresAt, onDone }) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      toast({ text: t('action.copied'), icon: 'check' });
    } catch {
      toast({ text: t('manage.temp.copyFailed'), tone: 'error' });
    }
  }
  return (
    <div className="stack-4">
      <div className="banner ok">
        <Icon name="circle-check" size={20} />
        <span className="grow">{t('manage.temp.created')}</span>
      </div>
      <div className="card flat stack-2">
        <span className="caption muted">{t('manage.temp.login')}</span>
        <span className="w500" dir="ltr">
          {login}
        </span>
        <span className="caption muted mt-2">{t('manage.temp.password')}</span>
        <div className="row between">
          <span className="mg-temp num" dir="ltr">
            {password}
          </span>
          <Button size="sm" icon="copy" onClick={copy}>
            {t('action.copy')}
          </Button>
        </div>
        {expiresAt ? <span className="caption muted">{t('manage.temp.expires', { date: fmt.date(expiresAt, { day: 'numeric', month: 'long' }) })}</span> : null}
      </div>
      <p className="small muted">{t('manage.temp.once')}</p>
      <Button variant="primary" block onClick={onDone}>
        {t('action.done')}
      </Button>
    </div>
  );
}

/** Impression (étiquettes QR, export PDF) : toujours en thème clair, puis retour au thème choisi */
export function printLight() {
  const root = document.documentElement;
  const previous = root.dataset.theme;
  root.dataset.theme = 'light';
  const restore = () => {
    if (previous) root.dataset.theme = previous;
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

/** Barre horizontale avec libellé et valeur (sujets du coach, revenus par formule) */
export function BarRow({ label, value, pct, tone = 'ember' }) {
  return (
    <div className="mg-barrow">
      <div className="row between">
        <span className="w500">{label}</span>
        <span className="num muted">{value}</span>
      </div>
      <div className={`mg-bar ${tone}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      </div>
    </div>
  );
}

/** Le lien vidéo vient de l'API : seuls les liens YouTube https sont affichés */
export function safeYoutube(url) {
  return typeof url === 'string' && /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\/[\w?=&/-]{1,200}$/.test(url) ? url : null;
}

/** Déplace un élément d'un tableau (réordonner) */
export function move(list, from, to) {
  if (to < 0 || to >= list.length) return list;
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

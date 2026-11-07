import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Empty, ErrorState, Icon, IconButton, OfflineBanner, QRCode, Ring, Skeleton, StatusPill } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useNow, useOnline } from '../../lib/hooks';
import RenewSheet from './RenewSheet';
import { STATUS_TONE } from './Account';
import './account.css';

/** Garde l'écran allumé pendant que la carte est affichée (si le navigateur le permet) */
function useWakeLock() {
  useEffect(() => {
    let lock = null;
    let alive = true;
    const request = () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((l) => {
          if (alive) lock = l;
          else l.release().catch(() => {});
        })
        .catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', request);
      if (lock) lock.release().catch(() => {});
    };
  }, []);
}

/**
 * Carte d'accès : QR signé par le serveur, renouvelé toutes les refreshSeconds secondes.
 * Le code n'est jamais stocké (ni cache, ni stockage local) : seulement en mémoire tant que la page est ouverte.
 */
export default function AccessCard() {
  const { t, tp, fmt, name } = useI18n();
  const online = useOnline();
  const [pass, setPass] = useState(null);
  const [error, setError] = useState(null);
  const [renewOpen, setRenewOpen] = useState(false);
  const deadline = useRef(0);
  const inflight = useRef(false);
  const now = useNow(1000);
  useWakeLock();

  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const data = await api.get('/me/access-pass');
      const full = (data.refreshSeconds || 30) * 1000;
      const left = Date.parse(data.expiresAt) - Date.now();
      // horloge du téléphone décalée : on se base sur la durée complète
      deadline.current = Date.now() + (left > 500 && left <= full ? left : full);
      setPass(data);
      setError(null);
    } catch (err) {
      setError(err);
      deadline.current = Date.now() + 10000;
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    load();
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  useEffect(() => {
    if (online && deadline.current && now >= deadline.current) load();
  }, [now, online, load]);

  const secondsLeft = Math.max(0, Math.ceil((deadline.current - now) / 1000));
  const total = pass?.refreshSeconds || 30;

  let body;
  if (!pass && !error) {
    body = (
      <div className="card pass-card">
        <Skeleton h={260} w={260} />
        <Skeleton line w="50%" />
      </div>
    );
  } else if (error && !pass) {
    body =
      error.code === 'ACCESS_DISABLED' ? (
        <Empty icon="lock" title={t('account.pass.disabledTitle')}>
          {t('err.ACCESS_DISABLED')}
        </Empty>
      ) : (
        <ErrorState error={error} onRetry={load} />
      );
  } else if (!pass.valid) {
    const frozen = pass.status === 'GELE';
    const none = pass.status === 'AUCUN';
    body = (
      <Empty
        icon={frozen ? 'snowflake' : 'circle-x'}
        title={t(frozen ? 'account.pass.frozenTitle' : none ? 'account.pass.noneTitle' : 'account.pass.expiredTitle')}
        action={
          frozen ? null : (
            <Button variant="warn" onClick={() => setRenewOpen(true)}>
              {t('account.sub.renew')}
            </Button>
          )
        }
      >
        {frozen
          ? t('account.pass.frozenText', { date: fmt.date(pass.subscription?.frozenUntil, { day: 'numeric', month: 'long' }) })
          : t(none ? 'account.pass.noneText' : 'account.pass.expiredText')}
      </Empty>
    );
  } else {
    const sub = pass.subscription;
    const tone = STATUS_TONE[pass.status] || '';
    body = (
      <>
        <section className="card pass-card">
          <div className="pass-who">
            <span className="avatar" aria-hidden="true">
              {pass.member.initials}
            </span>
            <span>
              <span className="w500" style={{ display: 'block' }}>{pass.member.name}</span>
              <span className="small muted" style={{ display: 'block' }}>
                {pass.gym?.name}
              </span>
            </span>
          </div>
          <div className="pass-qr">
            <QRCode value={pass.code} size={280} label={t('account.pass.qr', { name: pass.member.name })} />
          </div>
          <p className="small muted">{t('account.pass.show')}</p>
          <div className="pass-timer" aria-live="off">
            <Ring value={secondsLeft} max={total} size={36} stroke={4} color="var(--ember)">
              <span className="caption">
                <span className="num">{secondsLeft}</span>
              </span>
            </Ring>
            <span className="small muted">{tp('account.pass.refresh', secondsLeft)}</span>
          </div>
          <div className="row wrap" style={{ justifyContent: 'center' }}>
            {sub?.plan ? <span className="tag">{name(sub.plan)}</span> : null}
            <StatusPill tone={tone} icon={tone === 'ok' ? 'circle-check' : 'clock'}>
              {pass.status === 'ACTIF' || pass.status === 'EXPIRE_BIENTOT'
                ? t('account.pass.validUntil', { date: fmt.date(sub.endDate, { day: 'numeric', month: 'long' }) })
                : t(`account.sub.status.${pass.status}`)}
            </StatusPill>
          </div>
        </section>
        <p className="row-2 small muted">
          <Icon name="sun" size={18} />
          {t('account.pass.brightness')}
        </p>
        <p className="row-2 small muted">
          <Icon name="shield-check" size={18} />
          {t('account.pass.private')}
        </p>
      </>
    );
  }

  return (
    <main className="page pass">
      <header className="app-header compact">
        <IconButton icon="arrow-left" label={t('action.back')} to="/app/compte" />
        <h1>{t('account.pass.title')}</h1>
      </header>
      <OfflineBanner text={t('account.pass.offline')} />
      {body}
      <RenewSheet open={renewOpen} onClose={() => setRenewOpen(false)} />
    </main>
  );
}

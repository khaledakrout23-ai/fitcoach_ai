// Écran de la salle (téléviseur à l'entrée) : grand nombre, niveau, créneau calme. Rafraîchi toutes les 15 s, toujours sombre.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge, IconButton, Logo } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useInterval, useLoad, useNow } from '../../../lib/hooks';
import { HourlyBars } from './Dashboard';
import './ops.css';

const LEVEL_COLOR = { CALME: 'var(--ok)', FREQUENTEE: 'var(--warn)', PLEINE: 'var(--danger)' };

export default function LiveScreen() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const live = useLoad(() => api.get('/staff/live'), []);
  useInterval(() => live.reload(), 15000);
  const now = useNow(10000);
  const root = useRef(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const on = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else root.current?.requestFullscreen?.().catch(() => {});
  };

  const l = live.data;
  const stale = live.error && l;

  return (
    <div className="ops-screen" data-theme="dark" ref={root}>
      <div className="ops-screen-top">
        <Logo size={40} wordmark sub={user.gym?.name} />
        <span className="ops-screen-clock num">{fmt.time(new Date(now))}</span>
        <div className="row-2">
          <IconButton icon={full ? 'x' : 'monitor'} label={full ? t('ops.screen.exitFull') : t('ops.screen.full')} onClick={toggleFull} />
          {!full ? <IconButton icon="arrow-left" label={t('action.back')} onClick={() => navigate('/salle/direct')} /> : null}
        </div>
      </div>
      {l ? (
        <div className="ops-screen-body">
          <div className="ops-screen-main">
            <Gauge value={l.count} max={l.capacity || 1} size={460} stroke={26} color={LEVEL_COLOR[l.level]} label={t('ops.screen.label', { n: l.count, cap: l.capacity })}>
              <span className="ops-screen-num">
                <span className="num">{l.count}</span>
              </span>
            </Gauge>
            <div className="ops-screen-unit">{t('ops.live.people')}</div>
            <div className="ops-screen-level" style={{ color: LEVEL_COLOR[l.level] }}>
              {t(`ops.level.${l.level}`)}
            </div>
            {!l.open ? <div className="ops-screen-sub">{t('ops.screen.closed')}</div> : null}
          </div>
          <div className="ops-screen-side">
            {l.calmWindow ? (
              <div className="ops-screen-card">
                <div className="ops-screen-cap">{t('ops.screen.calmTitle')}</div>
                <div className="ops-screen-big num">
                  {l.calmWindow.from} – {l.calmWindow.to}
                </div>
              </div>
            ) : null}
            <div className="ops-screen-card">
              <div className="ops-screen-cap">{t('ops.screen.today')}</div>
              <HourlyBars hours={l.hourlyToday} height={160} />
            </div>
          </div>
        </div>
      ) : (
        <div className="ops-screen-body center">
          <span className="ops-screen-sub">{live.error ? t('ops.screen.offline') : t('state.loading')}</span>
        </div>
      )}
      {stale ? <div className="ops-screen-stale">{t('ops.screen.offline')}</div> : null}
    </div>
  );
}

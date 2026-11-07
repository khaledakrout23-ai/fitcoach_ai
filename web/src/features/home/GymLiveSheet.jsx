import { useState } from 'react';
import { Bars, ErrorState, Icon, PeopleDots, Sheet, Skeleton, StatusPill, ToggleRow, useToast } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

const MAX_DOTS = 45;
const hhmm = (h) => `${String(h).padStart(2, '0')}:00`;

/** Texte + couleur de l'état de la salle (« Calme pour un mardi ») */
export function liveStatus(data, t, fmt) {
  if (!data.open) {
    if (data.opening && Number(data.opening.open.slice(0, 2)) > new Date().getHours()) {
      return { tone: 'muted', text: t('home.live.opensAt', { time: data.opening.open }) };
    }
    return { tone: 'muted', text: data.opening ? t('home.live.closed') : t('home.live.closedToday') };
  }
  if (data.level === 'PLEINE') return { tone: 'danger', text: t('home.live.full') };
  const day = fmt.weekday(data.comparedToUsual?.weekday ?? 0);
  const trend = data.comparedToUsual?.trend;
  if (trend === 'CALMER' || (trend !== 'BUSIER' && data.level === 'CALME')) return { tone: 'ok', text: t('home.live.calmFor', { day }) };
  if (trend === 'BUSIER') return { tone: 'warn', text: t('home.live.busyFor', { day }) };
  return { tone: 'muted', text: t('home.live.usualFor', { day }) };
}

/** Gym en direct (B3) : toujours sombre. Des nombres, jamais des noms. */
export default function GymLiveSheet({ open, onClose, data, onChange, error, onRetry }) {
  const { t, tp, fmt, lang, error: errText } = useI18n();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [showMachines, setShowMachines] = useState(false);

  const subtitle = data ? [data.gym?.name, data.gym?.city].filter(Boolean).join(' · ') : undefined;

  const toggleCalm = async (next) => {
    setSaving(true);
    onChange((d) => (d ? { ...d, calmAlert: next } : d));
    try {
      await api.put('/me/prefs', { calmAlert: next });
      toast({ text: t(next ? 'home.sheet.calmOn' : 'home.sheet.calmOff'), icon: next ? 'bell-ring' : 'bell' });
    } catch (err) {
      onChange((d) => (d ? { ...d, calmAlert: !next } : d));
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('home.sheet.title')} subtitle={subtitle} dark variant="center">
      {!data ? (
        error ? (
          <ErrorState error={error} onRetry={onRetry} />
        ) : (
          <div className="stack">
            <Skeleton h={80} />
            <Skeleton h={180} />
          </div>
        )
      ) : (
        <LiveBody data={data} t={t} tp={tp} fmt={fmt} lang={lang} showMachines={showMachines} setShowMachines={setShowMachines}>
          <div className="card flat">
            <ToggleRow
              icon="bell-ring"
              title={t('home.sheet.calmAlert')}
              subtitle={t('home.sheet.calmAlertSub', { n: data.calmThreshold })}
              checked={Boolean(data.calmAlert)}
              onChange={toggleCalm}
              disabled={saving}
            />
          </div>
        </LiveBody>
      )}
    </Sheet>
  );
}

function LiveBody({ data, t, tp, fmt, lang, showMachines, setShowMachines, children }) {
  const st = liveStatus(data, t, fmt);
  const cmp = data.comparedToUsual;
  const day = fmt.weekday(cmp?.weekday ?? 0);
  const hour = hhmm(cmp?.hour ?? 0);
  let compare = '';
  if (data.count != null && cmp && data.open) {
    if (cmp.diff < 0) compare = t('home.sheet.lessThan', { n: -cmp.diff, day, hour });
    else if (cmp.diff > 0) compare = t('home.sheet.moreThan', { n: cmp.diff, day, hour });
    else compare = t('home.sheet.asUsual', { day, hour });
  }
  const delta = data.deltaSince?.count || 0;

  // points : 1 point = 1 personne tant que la capacité tient dans la grille, sinon 1 point = k personnes
  const scale = data.count != null && data.count > MAX_DOTS ? Math.ceil(data.count / MAX_DOTS) : 1;
  const bars = (data.hourlyToday || []).map((h) => ({
    value: h.count ?? h.forecast,
    tone: h.phase === 'NOW' ? 'now' : h.calm ? 'calm' : h.phase === 'PAST' ? 'past' : 'forecast',
    marker: h.phase === 'NOW' ? t('home.sheet.now') : null,
    label: hhmm(h.hour),
  }));
  const axis = [6, 9, 12, 15, 18, 21, 23].map((h) => (lang === 'ar' ? String(h) : `${h}h`));
  const broken = data.brokenMachines || [];

  return (
    <div className="stack gl">
      {data.count != null ? (
        <div className="gl-count">
          <span className="display">
            <span className="num">{fmt.num(data.count)}</span>
          </span>
          <span className="body-l gl-label">{t('home.sheet.atGym')}</span>
          {delta !== 0 && data.deltaSince ? (
            <span className="small muted row-2 gl-delta">
              <Icon name={delta > 0 ? 'trending-up' : 'trending-down'} size={18} />
              <span className="num">{t('home.sheet.since', { delta: `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, time: data.deltaSince.since })}</span>
            </span>
          ) : null}
        </div>
      ) : (
        <p className="muted small">{t('home.sheet.hidden')}</p>
      )}

      <p className="row-top gl-status">
        <span className={`live-dot ${st.tone === 'ok' ? '' : st.tone === 'muted' ? '' : st.tone}`} aria-hidden="true" />
        <span>
          <span className={`w500 ${st.tone}-text`}>{data.open ? `${t(`home.live.level.${data.level}`)}.` : st.text}</span>{' '}
          {compare}
        </span>
      </p>

      {data.count != null ? (
        <div className="stack-2">
          <PeopleDots count={Math.round(data.count / scale)} capacity={Math.round((data.capacity || data.count) / scale)} max={MAX_DOTS} />
          <span className="caption muted">{scale === 1 ? t('home.sheet.dotOne') : t('home.sheet.dotMany', { n: scale })}</span>
        </div>
      ) : null}

      {bars.length ? (
        <section className="card flat gl-chart">
          <div className="card-head">
            <h3 className="card-title">{t('home.sheet.today')}</h3>
            {data.peak ? (
              <span className="small muted">
                <span className="num">{t('home.sheet.peak', { n: data.peak.count, time: hhmm(data.peak.hour) })}</span>
              </span>
            ) : null}
          </div>
          <div className="gl-bars">
            <Bars data={bars} height={120} axis={axis} label={t('home.sheet.chartLabel')} />
          </div>
          <p className="row-2 small w500 mt-4">
            <Icon name="clock" size={18} className={data.calmWindow ? 'ok-text' : 'muted'} />
            {data.calmWindow ? (
              <span>{t('home.sheet.calmWindow', { from: data.calmWindow.from, to: data.calmWindow.to })}</span>
            ) : (
              <span className="muted">{t('home.sheet.noCalm')}</span>
            )}
          </p>
        </section>
      ) : null}

      <div className="list">
        {broken.length ? (
          <>
            <button type="button" className="list-row" onClick={() => setShowMachines(!showMachines)} aria-expanded={showMachines}>
              <Icon name="wrench" className="danger-text" />
              <span className="grow">
                <span className="w500">{tp('home.sheet.broken', broken.length)}</span>
                {!showMachines ? <span className="sub ellipsis">{broken.map((m) => m.label).join(', ')}</span> : null}
              </span>
              <Icon name={showMachines ? 'chevron-up' : 'chevron-down'} size={18} className="chev" />
            </button>
            {showMachines
              ? broken.map((m) => {
                  const key = m.outOfService && m.status !== 'REPARATION' ? 'HS' : m.status;
                  return (
                    <div key={m.id} className="list-row">
                      <span className="grow">
                        {t('home.sheet.machine', { label: m.label, code: m.code })}
                        <span className="sub">{m.zone}</span>
                      </span>
                      <StatusPill tone={key === 'SIGNALEE' ? 'warn' : 'danger'} icon={key === 'SIGNALEE' ? 'triangle-alert' : 'wrench'}>
                        {t(`home.sheet.status.${key}`)}
                      </StatusPill>
                    </div>
                  );
                })
              : null}
          </>
        ) : (
          <div className="list-row">
            <Icon name="circle-check" className="ok-text" />
            <span className="grow">{t('home.sheet.noBroken')}</span>
          </div>
        )}
      </div>

      {children}

      <p className="row-2 caption muted">
        <Icon name="shield-check" size={16} />
        {t('home.sheet.privacy')}
      </p>
    </div>
  );
}

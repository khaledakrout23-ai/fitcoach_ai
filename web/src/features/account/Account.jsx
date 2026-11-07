import { useRef, useState } from 'react';
import { Button, ErrorState, Field, FormError, Icon, IconButton, Input, ListRow, ProgressBar, Sheet, Skeleton, StatusPill, ToggleRow, useToast } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { useTheme } from '../../lib/theme';
import { useLoad } from '../../lib/hooks';
import RenewSheet, { telHref } from './RenewSheet';
import { ChoiceSheet, DeleteSheet, PasswordSheet, PrivacySheet, ProfileFieldSheet } from './ProfileSheets';
import './account.css';

const OPEN_REPORTS = ['NOUVEAU', 'VU', 'REPARATION'];
const NOTIF_KEYS = ['sessions', 'water', 'gym', 'meals'];
export const STATUS_TONE = { ACTIF: 'ok', EXPIRE_BIENTOT: 'warn', GRACE: 'warn', EXPIRE: 'danger', GELE: 'hydro', AUCUN: '' };

/** « +21622345678 » → « +216 22 345 678 » */
function prettyPhone(p) {
  const m = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(String(p || ''));
  return m ? `+216 ${m[1]} ${m[2]} ${m[3]}` : p || '';
}

/** Après déconnexion ou suppression : rechargement complet (aucun état du compte ne reste en mémoire) */
function leave() {
  window.location.assign('/bienvenue');
}

/** Compte du membre (B9) */
export default function Account() {
  const { user, logout } = useAuth();
  const { t, tp, fmt, label, lang, setLang, error: errText } = useI18n();
  const { theme, setTheme } = useTheme();
  const toast = useToast();
  const prefsRef = useRef(null);

  const sub = useLoad(() => api.get('/me/subscription'), []);
  const meta = useLoad(() => api.get('/meta'), []);
  const prefs = useLoad(() => api.get('/me/prefs'), []);
  const reports = useLoad(() => api.get('/me/reports'), []);

  const [sheet, setSheet] = useState(null); // name | renew | lang | notif | theme | password | privacy | delete
  const [field, setField] = useState(null);
  const close = () => setSheet(null);

  const features = user?.gym?.settings?.features || {};
  const m = meta.data;
  const titles = {
    goal: t('account.goal'),
    weight: t('account.weight'),
    height: t('account.height'),
    sex: t('account.sex'),
    injuries: t('account.injuries'),
    trainingDays: t('account.days'),
    level: t('account.level'),
    activity: t('account.activity'),
    sessionMinutes: t('account.minutes'),
    dietStyle: t('account.diet'),
  };
  const notSet = <span className="faint">{t('account.notSet')}</span>;
  const val = (v) => (v == null || v === '' ? notSet : v);
  const profileRows = [
    ['goal', val(label(m?.goals?.[user.goal]))],
    [
      'weight',
      user.weight == null
        ? notSet
        : (
            <span className="num">
              {user.goalWeight ? t('account.weightGoal', { from: fmt.num(user.weight, 1), to: fmt.kg(user.goalWeight) }) : fmt.kg(user.weight)}
            </span>
          ),
    ],
    ['height', user.height == null ? notSet : <span className="num">{`${fmt.num(user.height)} ${t('unit.cm')}`}</span>],
    ['sex', val(label(m?.sexes?.[user.sex]))],
    ['injuries', (user.injuries || []).length ? user.injuries.map((z) => label(m?.injuryZones?.[z]) || z).join(', ') : t('account.injuriesNone')],
    ['trainingDays', (user.trainingDays || []).length ? user.trainingDays.map((i) => fmt.weekdayShort(i)).join(', ') : notSet],
    ['level', val(label(m?.levels?.[user.level]))],
    ['activity', val(label(m?.activities?.[user.activity]))],
    ['sessionMinutes', user.sessionMinutes ? <span className="num">{`${fmt.num(user.sessionMinutes)} ${t('unit.min')}`}</span> : notSet],
    ['dietStyle', val(label(m?.dietStyles?.[user.dietStyle]))],
  ];

  const notif = prefs.data?.notifications;
  const notifSummary = notif
    ? (() => {
        const on = NOTIF_KEYS.filter((k) => notif[k]).map((k) => t(`account.notif.short.${k}`));
        if (!on.length) return t('account.notif.off');
        const s = on.join(', ');
        return s.charAt(0).toUpperCase() + s.slice(1);
      })()
    : '';

  const toggleNotif = async (key, value) => {
    const before = prefs.data;
    prefs.setData((d) => ({ ...d, notifications: { ...d.notifications, [key]: value } }));
    try {
      prefs.setData(await api.put('/me/prefs', { notifications: { [key]: value } }));
    } catch (err) {
      prefs.setData(before);
      toast({ text: errText(err), tone: 'error' });
    }
  };

  const saveBasic = (patch) => api.put('/me/profile', patch).catch((err) => toast({ text: errText(err), tone: 'error' }));

  const openReports = (reports.data || []).filter((r) => OPEN_REPORTS.includes(r.status)).length;
  const gymTel = telHref(user?.gym?.phone);

  const doLogout = async (everywhere) => {
    try {
      await logout(everywhere);
    } finally {
      leave();
    }
  };

  return (
    <main className="page account">
      <header className="app-header">
        <h1>{t('account.title')}</h1>
        <IconButton icon="settings" label={t('account.settings')} onClick={() => prefsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
      </header>

      <section className="ac-head">
        <span className="avatar lg ac-avatar" aria-hidden="true">
          {fmt.initials(user.name)}
        </span>
        <div className="grow ac-id">
          <h2 className="h3">{user.name}</h2>
          {user.email ? <p className="small muted ellipsis">{user.email}</p> : null}
          {user.phone ? (
            <p className="small muted">
              <span className="num">{prettyPhone(user.phone)}</span>
            </p>
          ) : null}
        </div>
        <IconButton icon="pencil" label={t('account.editName')} onClick={() => setSheet('name')} />
      </section>

      <SubscriptionCard state={sub} onRenew={() => setSheet('renew')} />

      <div className="list">
        <ListRow icon="scan-line" title={t('account.card')} sub={t('account.cardSub')} to="/app/carte" />
      </div>

      <div className="eyebrow plain">{t('account.profile')}</div>
      {meta.error ? <ErrorState error={meta.error} onRetry={meta.reload} compact /> : null}
      <div className="list">
        {profileRows.map(([key, value]) => (
          <ListRow key={key} title={titles[key]} value={value} onClick={() => setField(key)} />
        ))}
      </div>
      <p className="caption muted ac-note">{t('account.profileNote')}</p>

      <div className="eyebrow plain" ref={prefsRef}>
        {t('account.prefs')}
      </div>
      <div className="list">
        <ListRow title={t('account.language')} value={t(`lang.${lang}`)} onClick={() => setSheet('lang')} />
        <ListRow title={t('account.notifications')} value={prefs.error ? null : notifSummary} onClick={() => setSheet('notif')} />
        <ListRow title={t('account.theme')} value={t(`account.theme.${theme}`)} onClick={() => setSheet('theme')} />
        <ListRow title={t('account.units')} value={t('account.unitsValue')} />
      </div>

      <div className="eyebrow plain">{t('account.security')}</div>
      <div className="list">
        <ListRow icon="key-round" title={t('account.password')} sub={t('account.passwordSub')} onClick={() => setSheet('password')} />
      </div>

      <div className="eyebrow plain">{t('account.help')}</div>
      <div className="list">
        {features.reports !== false ? (
          <ListRow title={t('account.reports')} value={openReports ? tp('account.reportsOpen', openReports) : null} to="/app/signalements" />
        ) : null}
        {gymTel ? (
          <a className="list-row" href={gymTel}>
            <span className="grow">{t('account.contact')}</span>
            <span className="value">
              <span className="num">{user.gym.phone}</span>
            </span>
            <Icon name="phone" size={18} className="chev" />
          </a>
        ) : null}
        <ListRow title={t('account.privacy')} onClick={() => setSheet('privacy')} />
      </div>

      <button type="button" className="card ac-logout" onClick={() => doLogout(false)}>
        <Icon name="log-out" size={20} />
        {t('account.logout')}
      </button>
      <div className="stack-2 center ac-links">
        <button type="button" className="link-btn muted" onClick={() => doLogout(true)}>
          {t('account.logoutAll')}
        </button>
        <button type="button" className="link-btn muted" onClick={() => setSheet('delete')}>
          {t('account.delete')}
        </button>
      </div>

      <NameSheet open={sheet === 'name'} onClose={close} />
      <RenewSheet open={sheet === 'renew'} onClose={close} />
      <ProfileFieldSheet field={field} meta={m} titles={titles} onClose={() => setField(null)} />
      <ChoiceSheet
        open={sheet === 'lang'}
        onClose={close}
        title={t('account.language')}
        value={lang}
        options={['fr', 'ar', 'en'].map((l) => ({ value: l, label: t(`lang.${l}`) }))}
        onPick={(l) => {
          setLang(l);
          saveBasic({ language: l });
        }}
      />
      <ChoiceSheet
        open={sheet === 'theme'}
        onClose={close}
        title={t('account.theme')}
        value={theme}
        options={[
          { value: 'dark', label: t('account.theme.dark'), icon: 'moon' },
          { value: 'light', label: t('account.theme.light'), icon: 'sun' },
          { value: 'system', label: t('account.theme.system'), icon: 'smartphone' },
        ]}
        onPick={(v) => {
          setTheme(v);
          saveBasic({ theme: v });
        }}
      />
      <Sheet open={sheet === 'notif'} onClose={close} title={t('account.notifications')}>
        {prefs.error ? (
          <ErrorState error={prefs.error} onRetry={prefs.reload} compact />
        ) : !notif ? (
          <Skeleton h={200} />
        ) : (
          <div className="stack-2">
            {NOTIF_KEYS.map((k) => (
              <ToggleRow key={k} title={t(`account.notif.${k}`)} checked={Boolean(notif[k])} onChange={(v) => toggleNotif(k, v)} />
            ))}
          </div>
        )}
      </Sheet>
      <PasswordSheet open={sheet === 'password'} onClose={close} />
      <PrivacySheet open={sheet === 'privacy'} onClose={close} />
      <DeleteSheet
        open={sheet === 'delete'}
        onClose={close}
        onDeleted={() => {
          logout().finally(leave);
        }}
      />
    </main>
  );
}

/* ---------------------------------------------------------------- Abonnement */
function SubscriptionCard({ state, onRenew }) {
  const { t, tp, fmt, name } = useI18n();
  const { data, loading, error, reload } = state;
  if (loading && !data) return <Skeleton card h={190} />;
  if (error) return <ErrorState error={error} onRetry={reload} compact />;
  const s = data?.subscription;
  if (!s) {
    return (
      <section className="card">
        <span className="caption muted">{t('account.sub.eyebrow')}</span>
        <h2 className="h3">{t('account.sub.none')}</h2>
        <p className="small muted">{t('account.sub.noneText')}</p>
        <div className="grid-2 mt-4">
          <Button variant="warn" onClick={onRenew}>
            {t('account.sub.renew')}
          </Button>
          <Button variant="secondary" to="/app/compte/paiements">
            {t('account.sub.payments')}
          </Button>
        </div>
      </section>
    );
  }
  const tone = STATUS_TONE[data.status] || '';
  let pill;
  if (data.status === 'GELE') pill = t('account.sub.frozenUntil', { date: fmt.shortDate(s.frozenUntil) });
  else if (['ACTIF', 'EXPIRE_BIENTOT'].includes(data.status)) pill = tp('account.sub.daysLeft', Math.max(0, s.daysLeft));
  else pill = t(`account.sub.status.${data.status}`);
  const dateOpts = { day: 'numeric', month: 'long' };
  return (
    <section className="card ac-sub">
      <div className="row between row-top">
        <span className="caption muted">{t('account.sub.eyebrow')}</span>
        <StatusPill tone={tone}>{pill}</StatusPill>
      </div>
      <h2 className="h3">
        {s.plan ? name(s.plan) : t('account.sub.eyebrow')}
        {s.plan ? (
          <>
            {' · '}
            <span className="num">{fmt.money(s.plan.price)}</span>
          </>
        ) : null}
      </h2>
      {data.gym ? <p className="small muted">{data.gym.name}</p> : null}
      <div className="mt-4">
        <ProgressBar value={s.progress * 100} max={100} tone={tone === 'danger' ? 'danger' : tone === 'ok' ? '' : 'warn'} label={t('account.sub.eyebrow')} />
      </div>
      <div className="row between small muted mt-2">
        <span>{t('account.sub.since', { date: fmt.date(s.startDate, dateOpts) })}</span>
        <span>{t('account.sub.until', { date: fmt.date(s.endDate, dateOpts) })}</span>
      </div>
      <div className="grid-2 mt-4">
        <Button variant="warn" onClick={onRenew}>
          {t('account.sub.renew')}
        </Button>
        <Button variant="secondary" to="/app/compte/paiements">
          {t('account.sub.payments')}
        </Button>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Nom */
function NameSheet({ open, onClose }) {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [value, setValue] = useState(user?.name || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setValue(user?.name || '');
    setError(null);
  } else if (!open && wasOpen) setWasOpen(false);

  const clean = value.trim().replace(/\s+/g, ' ');
  const invalid = clean.length < 2;
  const save = async (e) => {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setError(null);
    try {
      await api.put('/me/profile', { name: clean });
      await refresh();
      toast({ text: t('account.saved'), icon: 'check' });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('account.editName')}>
      <form className="stack" onSubmit={save} noValidate>
        <Field label={t('account.name')} error={value && invalid ? t('account.nameError') : null}>
          <Input value={value} maxLength={100} autoComplete="name" onChange={(e) => setValue(e.target.value)} invalid={Boolean(value) && invalid} />
        </Field>
        <FormError error={error} />
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={invalid || clean === user?.name}>
          {t('action.save')}
        </Button>
      </form>
    </Sheet>
  );
}

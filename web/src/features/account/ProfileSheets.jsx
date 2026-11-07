import { useEffect, useState } from 'react';
import { Banner, Button, ChipGroup, Field, FormError, Input, OptionCard, PasswordInput, Segmented, Sheet, useToast } from '../../components';
import { api, download } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { localDate } from '../../lib/hooks';

const LIMITS = { weight: [30, 300], goalWeight: [30, 300], height: [100, 250] };
const MINUTES = [30, 45, 60, 90];
const META_KEYS = { goal: 'goals', sex: 'sexes', level: 'levels', activity: 'activities', dietStyle: 'dietStyles' };

const toNum = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
const inRange = (v, [min, max]) => v != null && Number.isFinite(v) && v >= min && v <= max;

/** Valeur initiale du brouillon pour un champ du profil */
function initialDraft(field, user) {
  if (field === 'weight') return { weight: user.weight ?? '', goalWeight: user.goalWeight ?? '' };
  if (field === 'injuries') return { injuries: user.injuries || [] };
  if (field === 'trainingDays') return { trainingDays: user.trainingDays || [] };
  return { [field]: user[field] ?? (field === 'height' ? '' : null) };
}

/**
 * Feuille de modification d'une ligne « Mon profil » (PUT /me/profile).
 * field : goal | weight | height | sex | injuries | trainingDays | level | activity | sessionMinutes | dietStyle
 */
export function ProfileFieldSheet({ field, meta, onClose, titles }) {
  const { t, label, fmt } = useI18n();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (field && user) {
      setDraft(initialDraft(field, user));
      setError(null);
    }
    // le brouillon repart de la valeur du compte à chaque ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field]);

  if (!field) return <Sheet open={false} />;
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // validation
  let fieldErrors = {};
  let payload = draft;
  if (field === 'weight') {
    const w = toNum(draft.weight);
    const g = toNum(draft.goalWeight);
    if (!inRange(w, LIMITS.weight)) fieldErrors.weight = t('account.rangeError', { min: 30, max: 300, unit: t('unit.kg') });
    if (g != null && !inRange(g, LIMITS.goalWeight)) fieldErrors.goalWeight = t('account.rangeError', { min: 30, max: 300, unit: t('unit.kg') });
    payload = { weight: w, goalWeight: g };
  } else if (field === 'height') {
    const h = toNum(draft.height);
    if (!inRange(h, LIMITS.height) || !Number.isInteger(h)) fieldErrors.height = t('account.rangeError', { min: 100, max: 250, unit: t('unit.cm') });
    payload = { height: h };
  } else if (field === 'trainingDays') {
    const n = (draft.trainingDays || []).length;
    if (n < 2 || n > 6) fieldErrors.trainingDays = t('account.daysHint');
  }
  const touched = JSON.stringify(payload) !== JSON.stringify(field === 'weight' ? { weight: user.weight, goalWeight: user.goalWeight ?? null } : initialDraft(field, user));
  const valid = !Object.keys(fieldErrors).length && (field in META_KEYS || field === 'sessionMinutes' ? draft[field] != null : true);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/me/profile', payload);
      await refresh();
      toast({ text: t('account.profileSaved'), icon: 'check' });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  let body = null;
  if (META_KEYS[field]) {
    const entries = Object.entries(meta?.[META_KEYS[field]] || {});
    body = (
      <div className="stack-2" role="radiogroup" aria-label={titles[field]}>
        {entries.map(([key, entry]) => (
          <OptionCard key={key} selected={draft[field] === key} onSelect={() => set({ [field]: key })} title={label(entry)} />
        ))}
      </div>
    );
  } else if (field === 'sessionMinutes') {
    body = (
      <Segmented
        label={titles.sessionMinutes}
        value={draft.sessionMinutes}
        onChange={(v) => set({ sessionMinutes: v })}
        options={MINUTES.map((m) => ({ value: m, label: fmt.duration(m) }))}
      />
    );
  } else if (field === 'weight') {
    body = (
      <div className="stack">
        <Field label={titles.weight} error={draft.weight !== '' ? fieldErrors.weight : null}>
          <Input inputMode="decimal" value={draft.weight} onChange={(e) => set({ weight: e.target.value })} suffix={t('unit.kg')} invalid={Boolean(fieldErrors.weight)} dir="ltr" />
        </Field>
        <Field label={t('account.goalWeight')} optional error={fieldErrors.goalWeight} hint={draft.goalWeight === '' ? t('account.noGoalWeight') : null}>
          <Input inputMode="decimal" value={draft.goalWeight} onChange={(e) => set({ goalWeight: e.target.value })} suffix={t('unit.kg')} invalid={Boolean(fieldErrors.goalWeight)} dir="ltr" />
        </Field>
      </div>
    );
  } else if (field === 'height') {
    body = (
      <Field label={titles.height} error={draft.height !== '' ? fieldErrors.height : null}>
        <Input inputMode="numeric" value={draft.height} onChange={(e) => set({ height: e.target.value.replace(/\D/g, '').slice(0, 3) })} suffix={t('unit.cm')} invalid={Boolean(fieldErrors.height)} dir="ltr" />
      </Field>
    );
  } else if (field === 'injuries') {
    body = (
      <div className="stack">
        <ChipGroup
          multiple
          label={titles.injuries}
          value={draft.injuries}
          onChange={(v) => set({ injuries: v })}
          options={Object.entries(meta?.injuryZones || {}).map(([key, entry]) => ({ value: key, label: label(entry) }))}
        />
        <p className="small muted">{t('account.injuriesHint')}</p>
      </div>
    );
  } else if (field === 'trainingDays') {
    body = (
      <div className="stack">
        <ChipGroup
          multiple
          label={titles.trainingDays}
          value={draft.trainingDays}
          onChange={(v) => set({ trainingDays: [...v].sort((a, b) => a - b) })}
          options={[0, 1, 2, 3, 4, 5, 6].map((i) => ({ value: i, label: fmt.weekday(i) }))}
        />
        <p className={`small ${fieldErrors.trainingDays ? 'danger-text' : 'muted'}`}>{t('account.daysHint')}</p>
      </div>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={titles[field]}
      subtitle={t('account.profileNote')}
      footer={
        <Button variant="primary" size="lg" block loading={saving} disabled={!valid || !touched} onClick={save}>
          {t('action.save')}
        </Button>
      }
    >
      <div className="stack">
        {body}
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

/** Choix simple dans une feuille (langue, apparence) */
export function ChoiceSheet({ open, onClose, title, options, value, onPick }) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="stack-2" role="radiogroup" aria-label={title}>
        {options.map((o) => (
          <OptionCard
            key={o.value}
            icon={o.icon}
            selected={value === o.value}
            title={o.label}
            onSelect={() => {
              onPick(o.value);
              onClose();
            }}
          />
        ))}
      </div>
    </Sheet>
  );
}

const pwOk = (p) => p.length >= 8 && /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p);

/** Changer le mot de passe (PUT /me/password) */
export function PasswordSheet({ open, onClose }) {
  const { t } = useI18n();
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setF({ current: '', next: '', confirm: '' });
      setError(null);
    }
  }, [open]);

  const errs = {};
  if (f.next && !pwOk(f.next)) errs.next = t('account.pw.weak');
  else if (f.next && f.next === f.current) errs.next = t('account.pw.same');
  if (f.confirm && f.confirm !== f.next) errs.confirm = t('account.pw.mismatch');
  if (error?.code === 'BAD_PASSWORD') errs.current = t('err.BAD_PASSWORD');
  const valid = f.current && f.next && f.confirm && !errs.next && !errs.confirm;

  const save = async (e) => {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      await api.put('/me/password', { currentPassword: f.current, newPassword: f.next });
      toast({ text: t('account.pw.done'), icon: 'shield-check' });
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t('account.password')}>
      <form className="stack" onSubmit={save} noValidate>
        <Field label={t('account.pw.current')} error={errs.current}>
          <PasswordInput autoComplete="current-password" value={f.current} invalid={Boolean(errs.current)} onChange={(e) => setF({ ...f, current: e.target.value })} />
        </Field>
        <Field label={t('account.pw.new')} error={errs.next} hint={t('account.pw.rules')}>
          <PasswordInput autoComplete="new-password" value={f.next} invalid={Boolean(errs.next)} onChange={(e) => setF({ ...f, next: e.target.value })} />
        </Field>
        <Field label={t('account.pw.confirm')} error={errs.confirm}>
          <PasswordInput autoComplete="new-password" value={f.confirm} invalid={Boolean(errs.confirm)} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
        </Field>
        {error && error.code !== 'BAD_PASSWORD' ? <FormError error={error} /> : null}
        <Button type="submit" variant="primary" size="lg" block loading={saving} disabled={!valid}>
          {t('action.save')}
        </Button>
      </form>
    </Sheet>
  );
}

/** Confidentialité : explications + export de mes données */
export function PrivacySheet({ open, onClose }) {
  const { t, error: errText } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const get = async () => {
    setBusy(true);
    try {
      await download('/me/export', `kammel-mes-donnees-${localDate()}.json`);
      toast({ text: t('account.privacy.downloaded'), icon: 'download' });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('account.privacy')}
      footer={
        <Button variant="secondary" size="lg" block icon="download" loading={busy} onClick={get}>
          {t('account.privacy.download')}
        </Button>
      }
    >
      <div className="stack small">
        <p className="row-top" style={{ gap: 12 }}>
          <span className="muted">{t('account.privacy.text1')}</span>
        </p>
        <p className="muted">{t('account.privacy.text2')}</p>
        <p className="muted">{t('account.privacy.text3')}</p>
      </div>
    </Sheet>
  );
}

/** Suppression du compte (DELETE /me avec le mot de passe) */
export function DeleteSheet({ open, onClose, onDeleted }) {
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setPassword('');
      setError(null);
    }
  }, [open]);
  const submit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await api.del('/me', { password });
      onDeleted();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('account.del.title')}>
      <form className="stack" onSubmit={submit} noValidate>
        <Banner tone="danger" icon="trash-2">
          {t('account.del.deleted')}
        </Banner>
        <p className="small muted">{t('account.del.kept')}</p>
        <p className="small w500">{t('account.del.final')}</p>
        <Field label={t('account.del.password')} error={error?.code === 'BAD_PASSWORD' ? t('err.BAD_PASSWORD') : null}>
          <PasswordInput autoComplete="current-password" value={password} invalid={error?.code === 'BAD_PASSWORD'} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && error.code !== 'BAD_PASSWORD' ? <FormError error={error} /> : null}
        <Button type="submit" variant="danger-solid" size="lg" block loading={busy} disabled={!password}>
          {t('account.del.confirm')}
        </Button>
        <Button variant="text" block onClick={onClose}>
          {t('action.cancel')}
        </Button>
      </form>
    </Sheet>
  );
}

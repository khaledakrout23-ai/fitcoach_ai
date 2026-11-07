// Briques communes des écrans d'exploitation de la salle (membres, encaissement, entrées)
import { useEffect, useState } from 'react';
import { Avatar, Button, Chip, Field, Icon, Input, Skeleton, StatusPill, useToast } from '../../../components';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useDebounced } from '../../../lib/hooks';

// ---------------------------------------------------------------- Dates locales (mêmes règles que le serveur)
export function localDate(d = new Date()) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

export function addMonths(date, n) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return localDate(d);
}

/** Fin d'une formule commencée à « start » : 1 mois du 8 oct. → 7 nov. inclus */
export function planEnd(start, plan) {
  if (plan.durationUnit === 'DAY') return addDays(start, Math.max(1, plan.duration) - 1);
  return addDays(addMonths(start, Math.max(1, plan.duration)), -1);
}

/** Arrondi au millime (TND) */
export const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

// ---------------------------------------------------------------- Réglages de la salle reçus avec /auth/me
export const METHOD_ICONS = { ESPECES: 'banknote', CARTE: 'credit-card' };

/** Moyens de paiement activés dans les paramètres de la salle */
export function enabledMethods(user) {
  const pm = user?.gym?.settings?.paymentMethods;
  if (!pm) return ['ESPECES'];
  return Object.keys(pm).filter((k) => pm[k]);
}

export function gymRules(user) {
  return user?.gym?.settings?.rules || { registrationFee: 0, graceDays: 0, maxFreezeDaysPerYear: 0 };
}

// ---------------------------------------------------------------- Libellés venant de /api/meta (types de panne, objectifs…)
let metaCache = null;
let metaPromise = null;
export function useMeta() {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return undefined;
    let alive = true;
    if (!metaPromise) {
      metaPromise = api.get('/meta').then((m) => {
        metaCache = m;
        return m;
      });
      metaPromise.catch(() => {
        metaPromise = null;
      });
    }
    metaPromise.then((m) => alive && setMeta(m)).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return meta || {};
}

// ---------------------------------------------------------------- Statuts
const SUB_TONES = { ACTIF: 'ok', EXPIRE_BIENTOT: 'warn', GRACE: 'warn', EXPIRE: 'danger', GELE: 'hydro', AUCUN: '', DESACTIVE: '' };

/** Texte du statut d'abonnement : « Expire dans 4 j », « Actif », « Gelé »… */
export function subStatusText(t, status, daysLeft) {
  if (status === 'EXPIRE_BIENTOT') return daysLeft === 0 ? t('ops.status.today') : t('ops.status.inDays', { n: daysLeft });
  return t(`ops.status.${status || 'AUCUN'}`);
}

export function SubStatus({ status, daysLeft }) {
  const { t } = useI18n();
  return (
    <StatusPill tone={SUB_TONES[status] ?? ''} led>
      {subStatusText(t, status, daysLeft)}
    </StatusPill>
  );
}

/** Pastille d'une entrée : refusée (raison) / entrée (avec alerte d'expiration proche) */
export function EntryStatus({ entry }) {
  const { t } = useI18n();
  if (entry.status === 'REFUSEE') {
    return (
      <StatusPill tone="danger" icon="circle-x">
        {t('ops.entry.refused')} · {t(`ops.reasonShort.${entry.refusalReason || 'AUCUN'}`)}
      </StatusPill>
    );
  }
  const sub = entry.subscription;
  if (sub && (sub.status === 'EXPIRE_BIENTOT' || sub.status === 'GRACE')) {
    return <SubStatus status={sub.status} daysLeft={sub.daysLeft} />;
  }
  return (
    <StatusPill tone="ok" icon="check">
      {t('ops.entry.in')}
    </StatusPill>
  );
}

// ---------------------------------------------------------------- Mot de passe provisoire : affiché une seule fois
export function TempPassword({ login, password, expiresAt }) {
  const { t, fmt } = useI18n();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast({ text: t('action.copied'), icon: 'check' });
    } catch {
      toast({ text: t('ops.temp.copyFailed'), tone: 'error' });
    }
  };
  return (
    <div className="stack-4">
      <div className="banner warn" role="alert">
        <Icon name="triangle-alert" size={20} />
        <span className="grow">{t('ops.temp.once')}</span>
      </div>
      <div className="card flat stack-2 ops-temp">
        <div className="row between">
          <span className="muted">{t('ops.temp.login')}</span>
          <span className="w500" dir="ltr">
            {login}
          </span>
        </div>
        <div className="row between">
          <span className="muted">{t('ops.temp.password')}</span>
          <span className="ops-temp-pass" dir="ltr">
            {password}
          </span>
        </div>
        {expiresAt ? <p className="caption muted">{t('ops.temp.expires', { date: fmt.date(expiresAt, { day: 'numeric', month: 'long' }) })}</p> : null}
      </div>
      <Button variant="secondary" icon={copied ? 'check' : 'copy'} onClick={copy} block>
        {copied ? t('action.copied') : t('ops.temp.copy')}
      </Button>
      <p className="small muted">{t('ops.temp.firstLogin')}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Choix de formule et de moyen de paiement
/** Remise d'une formule par rapport au prix mensuel (« −11 % ») */
function discountOf(plan, plans) {
  if (plan.durationUnit !== 'MONTH' || plan.duration <= 1) return 0;
  const monthly = plans.find((p) => p.durationUnit === 'MONTH' && p.duration === 1 && p.accessHours === plan.accessHours);
  if (!monthly || !monthly.price) return 0;
  const pct = Math.round((1 - plan.price / (monthly.price * plan.duration)) * 100);
  return pct > 0 ? pct : 0;
}

export function PlanPicker({ plans, value, onChange, discounts = false }) {
  const { t, fmt, name } = useI18n();
  return (
    <div className="ops-plan-grid" role="radiogroup" aria-label={t('ops.renew.plan')}>
      {plans.map((p) => {
        const off = discounts ? discountOf(p, plans) : 0;
        return (
          <button key={p.id} type="button" role="radio" aria-checked={value === p.id} className="ops-pick" onClick={() => onChange(p.id)}>
            <span className="w500" dir="auto">
              {name(p)}
            </span>
            <span className="small ops-pick-sub">
              <span className="num">{fmt.money(p.price)}</span>
              {off ? (
                <>
                  {' · '}
                  <span className="num">−{off} %</span>
                </>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function MethodChips({ methods, value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="chips" role="group" aria-label={t('ops.renew.payment')}>
      {methods.map((m) => (
        <Chip key={m} selected={value === m} icon={value === m ? undefined : METHOD_ICONS[m]} onClick={() => onChange(m)}>
          {t(`ops.method.${m}`)}
        </Chip>
      ))}
    </div>
  );
}

/** Montant reçu en espèces + monnaie à rendre */
export function CashChange({ total, received, onChange }) {
  const { t, fmt } = useI18n();
  const value = Number(String(received).replace(',', '.'));
  const change = received === '' || !Number.isFinite(value) ? null : round3(value - total);
  return (
    <div className="grid-2">
      <Field label={t('ops.renew.received')} error={change != null && change < 0 ? t('ops.renew.notEnough') : null}>
        <Input inputMode="decimal" value={received} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))} suffix={t('unit.tnd')} dir="ltr" placeholder={String(total)} />
      </Field>
      <Field label={t('ops.renew.change')}>
        <div className="ops-change">
          <span className="num">{change == null || change < 0 ? '–' : fmt.num(change, 3)}</span>
          <span className="muted">{t('unit.tnd')}</span>
        </div>
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------- Recherche d'un membre (nom ou téléphone)
export function MemberPicker({ onPick, autoFocus = false, placeholder, renderAction }) {
  const { t } = useI18n();
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim(), 250);
  const [state, setState] = useState({ items: [], loading: false, error: null });

  useEffect(() => {
    if (query.length < 2) {
      setState({ items: [], loading: false, error: null });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get(`/staff/members?q=${encodeURIComponent(query)}&pageSize=8&sort=name`)
      .then((r) => alive && setState({ items: r.items, loading: false, error: null }))
      .catch((error) => alive && setState({ items: [], loading: false, error }));
    return () => {
      alive = false;
    };
  }, [query]);

  return (
    <div className="stack-2">
      <div className="search ops-search-full">
        <Icon name="search" size={20} />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder || t('ops.search.placeholder')}
          aria-label={placeholder || t('ops.search.placeholder')}
          autoFocus={autoFocus}
          maxLength={60}
        />
      </div>
      {state.loading ? (
        <div className="stack-2">
          <Skeleton h={56} />
          <Skeleton h={56} />
        </div>
      ) : state.error ? (
        <p className="small danger-text">{t('ops.search.error')}</p>
      ) : query.length >= 2 && !state.items.length ? (
        <p className="small muted">{t('ops.search.none')}</p>
      ) : (
        <ul className="ops-pick-list">
          {state.items.map((m) => (
            <li key={m.id}>
              <button type="button" className="ops-member-row" onClick={() => onPick(m)}>
                <Avatar name={m.name} size="sm" />
                <span className="grow">
                  <span className="w500 ellipsis" dir="auto">
                    {m.name}
                  </span>
                  <span className="caption muted" dir="ltr">
                    {m.phone}
                  </span>
                </span>
                {renderAction ? renderAction(m) : <SubStatus status={m.status} daysLeft={m.subscription?.daysLeft} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Téléphone affiché « +216 22 345 678 » */
export function prettyPhone(phone) {
  const m = /^\+216(\d{2})(\d{3})(\d{3})$/.exec(String(phone || ''));
  return m ? `+216 ${m[1]} ${m[2]} ${m[3]}` : phone || '';
}

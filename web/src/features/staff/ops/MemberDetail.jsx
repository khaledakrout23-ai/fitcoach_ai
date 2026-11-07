// D5 / M5 — Fiche membre : contact, compte, profil (gérant / coach seulement), abonnement, visites, paiements, signalements
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar, Button, Empty, ErrorState, Field, FormError, Icon, IconButton, Input, PageSkeleton, PhoneInput, ProgressBar, Sheet, Stepper, StatusPill, Toggle, useToast } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { can } from '../../../lib/permissions';
import { SubStatus, TempPassword, addDays, gymRules, localDate, prettyPhone, useMeta } from './shared';
import { MessageSheet, RenewSheet } from './sheets';
import './ops.css';

const REPORT_TONES = { NOUVEAU: 'danger', VU: 'warn', REPARATION: 'warn', REPAREE: 'ok', REJETE: '' };

function Row({ label, children }) {
  return (
    <div className="ops-dl-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Profil sportif : uniquement si le serveur l'a envoyé (permission members.health + accord du membre) */
function Profile({ profile, language }) {
  const { t, fmt, label } = useI18n();
  const meta = useMeta();
  if (!profile.healthConsent) {
    return <p className="small muted">{t('ops.member.noConsent')}</p>;
  }
  const age = profile.age ?? (profile.birthYear ? new Date().getFullYear() - profile.birthYear : null);
  return (
    <dl className="ops-dl">
      {profile.goal ? <Row label={t('ops.member.goal')}>{label(meta.goals?.[profile.goal]) || profile.goal}</Row> : null}
      {profile.sex || age ? (
        <Row label={t('ops.member.sexAge')}>
          {[profile.sex ? label(meta.sexes?.[profile.sex]) : null, age ? t('ops.member.years', { n: age }) : null].filter(Boolean).join(' · ')}
        </Row>
      ) : null}
      {profile.weight ? (
        <Row label={t('ops.member.weight')}>
          <span className="num">
            {fmt.num(profile.weight, 1)}
            {profile.goalWeight ? ` → ${fmt.num(profile.goalWeight, 1)}` : ''} {t('unit.kg')}
          </span>
        </Row>
      ) : null}
      {profile.height ? (
        <Row label={t('ops.member.height')}>
          <span className="num">
            {profile.height} {t('unit.cm')}
          </span>
        </Row>
      ) : null}
      <Row label={t('ops.member.injuries')}>
        {profile.injuries?.length ? profile.injuries.map((z) => label(meta.injuryZones?.[z]) || z).join(', ') : t('ops.member.none')}
      </Row>
      {profile.trainingDays?.length ? <Row label={t('ops.member.days')}>{profile.trainingDays.map((d) => fmt.weekdayShort(d)).join(', ')}</Row> : null}
      {profile.level ? <Row label={t('ops.member.level')}>{label(meta.levels?.[profile.level]) || profile.level}</Row> : null}
      {profile.program ? (
        <Row label={t('ops.member.program')}>
          <span dir="auto">{profile.program.title}</span> · {t('ops.member.week', { n: profile.program.week, of: profile.program.weeks })}
        </Row>
      ) : null}
      <Row label={t('ops.member.language')}>{t(`lang.${language}`)}</Row>
    </dl>
  );
}

function FreezeSheet({ open, onClose, member, sub, onDone }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const today = localDate();
  const yearMax = gymRules(user).maxFreezeDaysPerYear || 30;
  const [days, setDays] = useState(7);
  const [from, setFrom] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open) {
      setDays(7);
      setFrom(today);
      setError(null);
    }
  }, [open, today]);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/staff/members/${member.id}/freeze`, { days, from });
      toast({ text: t('ops.freeze.done', { n: days }), icon: 'snowflake' });
      onDone();
      onClose();
    } catch (err) {
      if (err.code === 'FREEZE_LIMIT' && err.details) err.message = t('ops.freeze.limit', { n: err.details.allowed });
      setError(err.code === 'FREEZE_LIMIT' ? { code: 'X', message: err.message } : err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ops.freeze.title')}
      subtitle={member?.name}
      footer={
        <div className="ops-sheet-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" icon="snowflake" className="grow" loading={busy} onClick={submit} disabled={!from}>
            {t('ops.freeze.cta', { n: days })}
          </Button>
        </div>
      }
    >
      <div className="stack-4">
        <div className="row between">
          <span className="w500">{t('ops.freeze.days')}</span>
          <Stepper value={days} onChange={setDays} min={1} max={Math.max(1, Math.min(180, yearMax))} label={t('ops.freeze.days')} />
        </div>
        <Field label={t('ops.freeze.from')}>
          <Input type="date" value={from} min={today} max={addDays(today, 60)} onChange={(e) => setFrom(e.target.value)} dir="ltr" />
        </Field>
        {sub?.endDate ? (
          <p className="small muted">
            {t('ops.freeze.newEnd', { date: fmt.date(addDays(sub.endDate, days), { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </p>
        ) : null}
        <p className="small muted">{t('ops.freeze.rules', { used: sub?.freezeDaysUsed || 0, max: yearMax })}</p>
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

function EditSheet({ open, onClose, member, onDone }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (open && member) {
      const d = String(member.phone || '').replace(/^\+216/, '').replace(/\D/g, '');
      setForm({ name: member.name, phone: d.length === 8 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}` : d, email: member.email || '' });
      setError(null);
    }
  }, [open, member]);
  const digits = form.phone.replace(/\D/g, '');
  const valid = form.name.trim().length >= 2 && digits.length === 8 && (!form.email.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()));
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/staff/members/${member.id}`, { name: form.name.trim(), phone: `+216${digits}`, email: form.email.trim() || null });
      toast({ text: t('ops.saved'), icon: 'check' });
      onDone();
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ops.member.edit')}
      footer={
        <div className="ops-sheet-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" className="grow" disabled={!valid} loading={busy} onClick={submit}>
            {t('action.save')}
          </Button>
        </div>
      }
    >
      <div className="stack-4">
        <Field label={t('ops.member.name')}>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value.slice(0, 100) }))} dir="auto" />
        </Field>
        <Field label={t('ops.new.phone')}>
          <PhoneInput value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
        </Field>
        <Field label={t('ops.new.email')} optional>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.slice(0, 150) }))} dir="ltr" />
        </Field>
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

/** Confirmation simple (désactiver, nouveau mot de passe) */
function Confirm({ open, onClose, title, text, cta, variant = 'primary', onConfirm, busy, children }) {
  const { t } = useI18n();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        children ? (
          <Button variant="primary" block onClick={onClose}>
            {t('action.done')}
          </Button>
        ) : (
          <div className="ops-sheet-actions">
            <Button variant="secondary" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button variant={variant} className="grow" loading={busy} onClick={onConfirm}>
              {cta}
            </Button>
          </div>
        )
      }
    >
      {children || <p className="muted">{text}</p>}
    </Sheet>
  );
}

export default function MemberDetail() {
  const { id } = useParams();
  const { t, fmt, name, label } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const meta = useMeta();
  const [params, setParams] = useSearchParams();
  const data = useLoad(() => api.get(`/staff/members/${encodeURIComponent(id)}`), [id]);
  const [sheet, setSheet] = useState(null); // renew | freeze | message | edit | reset | deactivate
  const [temp, setTemp] = useState(null); // mot de passe provisoire : en mémoire le temps de l'affichage
  const [busy, setBusy] = useState(false);

  const write = can(user, 'members.write');
  const pay = can(user, 'payments');

  // « Renouveler » depuis le tableau de bord ou le scanner
  useEffect(() => {
    if (params.get('renouveler') && data.data && write && pay) {
      setSheet('renew');
      const next = new URLSearchParams(params);
      next.delete('renouveler');
      setParams(next, { replace: true });
    }
  }, [params, data.data, write, pay, setParams]);

  if (!data.data) {
    return data.error ? (
      <div className="stack-4">
        <Link to="/salle/membres" className="link-btn ops-back">
          <Icon name="arrow-left" size={18} /> {t('staffnav.members')}
        </Link>
        <ErrorState error={data.error} onRetry={data.error.status === 404 ? undefined : data.reload} />
      </div>
    ) : (
      <PageSkeleton cards={3} />
    );
  }

  const d = data.data;
  const m = d.member;
  const sub = d.subscription;
  const frozen = sub.status === 'GELE' || (sub.frozenUntil && sub.frozenUntil >= localDate());
  const total = sub.startDate && sub.endDate ? (new Date(sub.endDate) - new Date(sub.startDate)) / 86400000 + 1 : 0;
  const elapsed = sub.startDate ? (Date.now() - new Date(`${sub.startDate}T00:00:00`)) / 86400000 : 0;
  const pct = total ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;

  const close = () => setSheet(null);
  const resetPassword = async () => {
    setBusy(true);
    try {
      const res = await api.post(`/staff/members/${m.id}/reset-password`);
      setTemp(res);
      data.reload();
    } catch (err) {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
      close();
    } finally {
      setBusy(false);
    }
  };
  const setActive = async (active) => {
    setBusy(true);
    try {
      await api.post(`/staff/members/${m.id}/${active ? 'reactivate' : 'deactivate'}`);
      toast({ text: t(active ? 'ops.member.reactivated' : 'ops.member.deactivated'), icon: active ? 'user-check' : 'user-x' });
      data.reload();
      close();
    } catch (err) {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const setAccess = async (accessActive) => {
    try {
      await api.put(`/staff/members/${m.id}/access`, { accessActive });
      data.setData((x) => ({ ...x, member: { ...x.member, accessActive } }));
    } catch {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
    }
  };
  const unfreeze = async () => {
    try {
      await api.post(`/staff/members/${m.id}/unfreeze`);
      toast({ text: t('ops.freeze.undone'), icon: 'check' });
      data.reload();
    } catch (err) {
      toast({ text: t('ops.saveFailed'), tone: 'error' });
    }
  };

  const accountText = !m.active
    ? t('ops.account.disabled')
    : d.account.mustChangePassword
      ? d.account.tempPasswordExpiresAt && new Date(d.account.tempPasswordExpiresAt) < new Date()
        ? t('ops.account.tempExpired')
        : t('ops.account.temp')
      : d.account.hasLoggedIn
        ? t('ops.account.ok')
        : t('ops.account.never');

  const actions = (
    <>
      {can(user, 'notifications') ? (
        <Button icon="bell" onClick={() => setSheet('message')}>
          {t('ops.member.message')}
        </Button>
      ) : null}
      {write && sub.id ? (
        frozen ? (
          <Button icon="snowflake" onClick={unfreeze}>
            {t('ops.member.unfreeze')}
          </Button>
        ) : sub.status !== 'EXPIRE' && sub.status !== 'AUCUN' ? (
          <Button icon="snowflake" onClick={() => setSheet('freeze')}>
            {t('ops.member.freeze')}
          </Button>
        ) : null
      ) : null}
      {write && pay ? (
        <Button variant="primary" icon="refresh-cw" onClick={() => setSheet('renew')}>
          {t('ops.member.renew')}
        </Button>
      ) : null}
    </>
  );

  return (
    <div className="stack-4 ops">
      <header className="page-head ops-member-head">
        <div className="titles">
          <Link to="/salle/membres" className="link-btn ops-back ops-desk-only-inline">
            <Icon name="arrow-left" size={18} /> {t('staffnav.members')}
          </Link>
          <IconButton icon="arrow-left" label={t('action.back')} onClick={() => navigate(-1)} className="ops-phone-only" />
          <h1 className="ops-desk-only" dir="auto">
            {m.name}
          </h1>
        </div>
        <div className="actions ops-desk-only">{actions}</div>
      </header>

      {/* Téléphone (M5) : identité + actions rapides */}
      <div className="ops-phone-only stack-4">
        <div className="row-2">
          <Avatar name={m.name} size="lg" />
          <div className="min0">
            <h1 className="h2" dir="auto">
              {m.name}
            </h1>
            <div className="small muted" dir="ltr">
              {prettyPhone(m.phone)}
            </div>
          </div>
        </div>
        <div className="ops-quick-actions">
          {m.phone ? (
            <a className="ops-qa" href={`tel:${String(m.phone).replace(/[^\d+]/g, '')}`}>
              <Icon name="phone" />
              {t('ops.member.call')}
            </a>
          ) : null}
          {can(user, 'notifications') ? (
            <button type="button" className="ops-qa" onClick={() => setSheet('message')}>
              <Icon name="bell" />
              {t('ops.member.messageShort')}
            </button>
          ) : null}
          {write && sub.id && (frozen || (sub.status !== 'EXPIRE' && sub.status !== 'AUCUN')) ? (
            <button type="button" className="ops-qa" onClick={frozen ? unfreeze : () => setSheet('freeze')}>
              <Icon name="snowflake" />
              {frozen ? t('ops.member.unfreeze') : t('ops.member.freeze')}
            </button>
          ) : null}
        </div>
      </div>

      {!m.active ? (
        <div className="banner danger" role="status">
          <Icon name="user-x" size={20} />
          <span className="grow">{t('ops.member.inactiveBanner')}</span>
        </div>
      ) : null}

      <div className="ops-member-grid">
        {/* Colonne contact + compte + profil */}
        <section className="card pad-lg stack-4 ops-member-side" aria-label={t('ops.member.contact')}>
          <div className="row-2 ops-desk-only-flex">
            <Avatar name={m.name} size="lg" />
            <div className="min0">
              <div className="h3" dir="auto">
                {m.name}
              </div>
              <div className="small muted">{t('ops.member.since', { date: fmt.date(m.createdAt, { month: 'long', year: 'numeric' }) })}</div>
            </div>
          </div>
          <ul className="ops-contact">
            <li className="ops-desk-only-flex">
              <Icon name="phone" size={18} />
              <span dir="ltr">{prettyPhone(m.phone)}</span>
            </li>
            {m.email ? (
              <li>
                <Icon name="mail" size={18} />
                <span className="ellipsis" dir="ltr">
                  {m.email}
                </span>
              </li>
            ) : null}
            <li>
              <Icon name="qr-code" size={18} />
              <span className="grow">{m.accessActive ? t('ops.member.cardOn') : t('ops.member.cardOff')}</span>
              {write ? <Toggle checked={m.accessActive} onChange={setAccess} label={t('ops.member.card')} /> : null}
            </li>
            <li>
              <Icon name="lock" size={18} />
              <span className="grow">{accountText}</span>
              {write ? (
                <button type="button" className="link-btn" onClick={() => setSheet('reset')}>
                  {t('ops.member.reset')}
                </button>
              ) : null}
            </li>
          </ul>
          {write ? (
            <div className="row-2 wrap">
              <Button size="sm" variant="ghost" icon="pencil" onClick={() => setSheet('edit')}>
                {t('ops.member.edit')}
              </Button>
              <Button size="sm" variant={m.active ? 'danger' : 'secondary'} icon={m.active ? 'user-x' : 'user-check'} onClick={() => (m.active ? setSheet('deactivate') : setActive(true))}>
                {m.active ? t('ops.member.deactivate') : t('ops.member.reactivate')}
              </Button>
            </div>
          ) : null}

          {d.profile ? (
            <div className="stack-2">
              <div className="small muted w500">{t('ops.member.profile')}</div>
              <Profile profile={d.profile} language={m.language} />
              <p className="caption muted mt-4">{t('ops.member.healthNote')}</p>
            </div>
          ) : null}
        </section>

        <div className="stack-4 min0">
          {/* Abonnement */}
          <section className="card pad-lg stack-2" aria-labelledby="ops-sub">
            <div className="row between row-top">
              <div className="min0">
                <div id="ops-sub" className="small muted">
                  {t('ops.member.subscription')}
                </div>
                {sub.plan ? (
                  <div className="h2">
                    <span dir="auto">{name(sub.plan)}</span> · <span className="num">{fmt.money(sub.amount)}</span>
                  </div>
                ) : (
                  <div className="h3">{t('ops.status.AUCUN')}</div>
                )}
              </div>
              {sub.status === 'EXPIRE_BIENTOT' ? (
                <StatusPill tone="warn" led>
                  {t('ops.member.daysLeft', { n: sub.daysLeft })}
                </StatusPill>
              ) : (
                <SubStatus status={sub.status} daysLeft={sub.daysLeft} />
              )}
            </div>
            {sub.startDate ? (
              <>
                <p className="small muted">
                  {t('ops.member.period', {
                    from: fmt.date(sub.startDate, { day: 'numeric', month: 'long' }),
                    to: fmt.date(sub.endDate, { day: 'numeric', month: 'long', year: 'numeric' }),
                    method: t(`ops.methodLower.${sub.paymentMethod}`),
                  })}
                </p>
                <ProgressBar value={pct} max={100} tone={sub.status === 'ACTIF' ? '' : sub.status === 'EXPIRE' ? 'danger' : 'warn'} label={t('ops.member.subscription')} />
                {sub.frozenFrom ? (
                  <p className="small hydro-text">
                    {t('ops.member.frozenInfo', { from: fmt.shortDate(sub.frozenFrom), to: fmt.shortDate(sub.frozenUntil) })}
                  </p>
                ) : null}
              </>
            ) : null}
            {d.lastExpiryReminder ? <p className="small muted">{t('ops.member.reminder', { when: fmt.when(d.lastExpiryReminder.at) })}</p> : null}
            {write && pay ? (
              <Button variant="primary" block className="ops-phone-only mt-2" onClick={() => setSheet('renew')}>
                {t('ops.member.renew')}
              </Button>
            ) : null}
          </section>

          {/* KPI */}
          <div className="ops-kpi4">
            <div className="kpi">
              <span className="kpi-label">{t('ops.member.visits30')}</span>
              <span className="kpi-value">
                <span className="num">{d.stats.visits30}</span>
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t('ops.member.sessions')}</span>
              <span className="kpi-value">
                <span className="num">{d.stats.sessionsDone}</span>
                {d.stats.sessionsTotal ? <small className="num"> / {d.stats.sessionsTotal}</small> : null}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t('ops.member.streak')}</span>
              <span className="kpi-value">
                <span className="num">{d.stats.streakDays}</span>
                <small> {t('ops.member.daysUnit')}</small>
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{t('ops.member.totalPaid')}</span>
              <span className="kpi-value">
                <span className="num">{fmt.num(d.stats.totalPaid, 3)}</span>
                <small> {t('unit.tnd')}</small>
              </span>
            </div>
          </div>

          <div className="split even">
            <section className="card pad-lg" aria-labelledby="ops-visits">
              <h2 id="ops-visits" className="card-title mb-4">
                {t('ops.member.visits')}
              </h2>
              {d.recentVisits.length ? (
                <ul className="ops-lines">
                  {d.recentVisits.map((v) => (
                    <li key={v.id}>
                      <span className="w500 grow">
                        {fmt.date(v.at, { weekday: 'long', day: 'numeric', month: 'short' })} · <span className="num">{fmt.time(v.at)}</span>
                      </span>
                      <span className="muted small">{v.inProgress ? t('ops.member.inProgress') : v.durationMin != null ? fmt.duration(v.durationMin) : '—'}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty icon="door-open" title={t('ops.member.noVisits')} />
              )}
            </section>

            <div className="stack-4">
              {d.payments ? (
                <section className="card pad-lg" aria-labelledby="ops-pay">
                  <h2 id="ops-pay" className="card-title mb-4">
                    {t('ops.member.payments')}
                  </h2>
                  {d.payments.length ? (
                    <ul className="ops-lines">
                      {d.payments.slice(0, 6).map((p) => (
                        <li key={p.id}>
                          <span className="w500 grow">
                            <span className="num">{fmt.shortDate(p.createdAt)}</span> · <span dir="auto">{p.plan ? name(p.plan) : t(`ops.kind.${p.kind}`)}</span> · {t(`ops.method.${p.method}`)}
                          </span>
                          <span className="num w500">{fmt.money(p.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty icon="wallet" title={t('ops.member.noPayments')} />
                  )}
                </section>
              ) : null}
              {d.reports.length ? (
                <section className="card pad-lg" aria-labelledby="ops-rep">
                  <h2 id="ops-rep" className="card-title mb-4">
                    {t('ops.member.reports')}
                  </h2>
                  <ul className="ops-lines">
                    {d.reports.map((r) => (
                      <li key={r.id}>
                        <Icon name="wrench" size={18} className="danger-text" />
                        <span className="w500 grow">
                          {r.machine ? `${r.machine.label} #${r.machine.code}` : '—'} · {fmt.when(r.createdAt)}
                        </span>
                        <StatusPill tone={REPORT_TONES[r.status]} led>
                          {label(meta.reportStatuses?.[r.status]) || r.status}
                        </StatusPill>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <RenewSheet open={sheet === 'renew'} onClose={close} member={m} subscription={sub} onDone={data.reload} />
      <FreezeSheet open={sheet === 'freeze'} onClose={close} member={m} sub={sub} onDone={data.reload} />
      <MessageSheet open={sheet === 'message'} onClose={close} member={m} />
      <EditSheet open={sheet === 'edit'} onClose={close} member={m} onDone={data.reload} />
      <Confirm
        open={sheet === 'deactivate'}
        onClose={close}
        title={t('ops.member.deactivateTitle')}
        text={t('ops.member.deactivateText', { name: m.name })}
        cta={t('ops.member.deactivate')}
        variant="danger-solid"
        busy={busy}
        onConfirm={() => setActive(false)}
      />
      <Confirm
        open={sheet === 'reset'}
        onClose={() => {
          setTemp(null);
          close();
        }}
        title={temp ? t('ops.reset.doneTitle') : t('ops.reset.title')}
        text={t('ops.reset.text', { name: m.name })}
        cta={t('ops.reset.cta')}
        busy={busy}
        onConfirm={resetPassword}
      >
        {temp ? <TempPassword login={prettyPhone(temp.login)} password={temp.temporaryPassword} expiresAt={temp.temporaryPasswordExpiresAt} /> : null}
      </Confirm>
    </div>
  );
}

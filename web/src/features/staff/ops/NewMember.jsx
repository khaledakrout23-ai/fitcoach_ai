// D7 — Nouveau membre : compte + abonnement + paiement en une fois, puis mot de passe provisoire affiché une seule fois
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Checkbox, Empty, ErrorState, Field, FormError, Input, PhoneInput, Sheet, Skeleton } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { CashChange, MethodChips, PlanPicker, TempPassword, enabledMethods, gymRules, localDate, planEnd, prettyPhone, round3 } from './shared';

const EMPTY = { firstName: '', lastName: '', phone: '', birthDate: '', email: '' };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function NewMember({ open, onClose, onCreated }) {
  const { t, fmt, name } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const methods = enabledMethods(user);
  const fee = Number(gymRules(user).registrationFee) || 0;
  const plans = useLoad(() => (open ? api.get('/staff/plans') : Promise.resolve(null)), [open]);
  const list = useMemo(() => (plans.data?.plans || []).filter((p) => !p.archived && p.durationUnit === 'MONTH'), [plans.data]);
  const [form, setForm] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [planId, setPlanId] = useState(null);
  const [method, setMethod] = useState(methods[0]);
  const [chargeFee, setChargeFee] = useState(true);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null); // réponse du serveur, gardée en mémoire seulement le temps de l'affichage

  useEffect(() => {
    if (!open) {
      setCreated(null); // le mot de passe provisoire disparaît dès la fermeture
      return;
    }
    setForm(EMPTY);
    setTouched({});
    setPlanId(null);
    setMethod(methods[0]);
    setChargeFee(true);
    setReceived('');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!planId && list.length) setPlanId((list.find((p) => p.visible) || list[0]).id);
  }, [list, planId]);

  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: typeof v === 'string' ? v : v.target.value }));
  const blur = (k) => () => setTouched((x) => ({ ...x, [k]: true }));
  const digits = form.phone.replace(/\D/g, '');
  const errors = {
    firstName: form.firstName.trim() ? null : t('ops.new.required'),
    lastName: form.lastName.trim() ? null : t('ops.new.required'),
    phone: digits.length === 8 ? null : t('ops.new.phoneInvalid'),
    email: !form.email.trim() || EMAIL.test(form.email.trim()) ? null : t('ops.new.emailInvalid'),
  };
  const plan = list.find((p) => p.id === planId);
  const today = localDate();
  const total = round3((plan ? plan.price : 0) + (chargeFee ? fee : 0));
  const cashValid = method !== 'ESPECES' || received === '' || Number(String(received).replace(',', '.')) >= total;
  const valid = !Object.values(errors).some(Boolean) && Boolean(plan && method) && cashValid;

  const submit = async (e) => {
    e?.preventDefault();
    setTouched({ firstName: true, lastName: true, phone: true, email: true });
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: `+216${digits}`,
        planId: plan.id,
        paymentMethod: method,
        chargeRegistrationFee: chargeFee,
      };
      if (form.email.trim()) body.email = form.email.trim();
      if (form.birthDate) body.birthDate = form.birthDate;
      const res = await api.post('/staff/members', body);
      setCreated(res);
      onCreated?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Sheet
        open={open}
        onClose={onClose}
        variant="drawer"
        title={t('ops.new.createdTitle')}
        subtitle={t('ops.new.createdSub', { name: created.member.name, amount: fmt.money(created.total) })}
        footer={
          <div className="ops-sheet-actions">
            <Button variant="secondary" onClick={onClose}>
              {t('action.close')}
            </Button>
            <Button variant="primary" className="grow" onClick={() => navigate(`/salle/membres/${created.member.id}`)}>
              {t('ops.new.openProfile')}
            </Button>
          </div>
        }
      >
        <TempPassword login={prettyPhone(created.login)} password={created.temporaryPassword} expiresAt={created.temporaryPasswordExpiresAt} />
      </Sheet>
    );
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      variant="drawer"
      title={t('ops.new.title')}
      subtitle={t('ops.new.subtitle')}
      footer={
        <div className="ops-sheet-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" className="grow" onClick={submit} disabled={!valid} loading={busy}>
            {t('ops.new.cta', { amount: fmt.money(total) })}
          </Button>
        </div>
      }
    >
      <form className="stack-4" onSubmit={submit} noValidate>
        <div className="grid-2">
          <Field label={t('ops.new.firstName')} error={touched.firstName && errors.firstName}>
            <Input value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')} autoComplete="off" maxLength={50} dir="auto" invalid={touched.firstName && Boolean(errors.firstName)} />
          </Field>
          <Field label={t('ops.new.lastName')} error={touched.lastName && errors.lastName}>
            <Input value={form.lastName} onChange={set('lastName')} onBlur={blur('lastName')} autoComplete="off" maxLength={50} dir="auto" invalid={touched.lastName && Boolean(errors.lastName)} />
          </Field>
        </div>
        <div className="grid-2">
          <Field label={t('ops.new.phone')} error={touched.phone && errors.phone}>
            <PhoneInput value={form.phone} onChange={set('phone')} onBlur={blur('phone')} invalid={touched.phone && Boolean(errors.phone)} />
          </Field>
          <Field label={t('ops.new.birth')} optional>
            <Input type="date" value={form.birthDate} onChange={set('birthDate')} max={today} dir="ltr" />
          </Field>
        </div>
        <Field label={t('ops.new.email')} optional error={touched.email && errors.email}>
          <Input type="email" value={form.email} onChange={set('email')} onBlur={blur('email')} autoComplete="off" maxLength={150} dir="ltr" invalid={touched.email && Boolean(errors.email)} />
        </Field>

        <div className="card flat stack-2 small">
          <div className="w500">{t('ops.new.access')}</div>
          <div className="row between">
            <span className="muted">{t('ops.temp.login')}</span>
            <span className="w500" dir="ltr">
              {digits ? prettyPhone(`+216${digits}`) : '+216 …'}
            </span>
          </div>
          <div className="row between">
            <span className="muted">{t('ops.temp.password')}</span>
            <span className="muted">{t('ops.new.generated')}</span>
          </div>
          <p className="caption muted">{t('ops.new.accessHint')}</p>
        </div>

        <div className="stack-2">
          <span className="label w500">{t('ops.renew.plan')}</span>
          {plans.loading && !plans.data ? (
            <Skeleton h={64} />
          ) : plans.error ? (
            <ErrorState error={plans.error} onRetry={plans.reload} compact />
          ) : list.length ? (
            <PlanPicker plans={list} value={planId} onChange={setPlanId} />
          ) : (
            <Empty icon="tag" title={t('ops.renew.noPlans')} />
          )}
        </div>
        <div className="stack-2">
          <span className="label w500">{t('ops.renew.payment')}</span>
          <MethodChips methods={methods} value={method} onChange={setMethod} />
        </div>
        {method === 'ESPECES' ? <CashChange total={total} received={received} onChange={setReceived} /> : null}

        {plan ? (
          <div className="card flat stack-2 small">
            <div className="row between">
              <span className="muted">
                <span dir="auto">{name(plan)}</span> · <span className="num">{fmt.shortDate(today)}</span> → <span className="num">{fmt.shortDate(planEnd(today, plan))}</span>
              </span>
              <span className="num">{fmt.money(plan.price)}</span>
            </div>
            {fee > 0 ? (
              <div className="row between">
                <span className="muted">{t('ops.new.fee')}</span>
                <span className={`num ${chargeFee ? '' : 'strike muted'}`}>{fmt.money(fee)}</span>
              </div>
            ) : null}
            <div className="row between w500">
              <span>{t('ops.new.total')}</span>
              <span className="num">{fmt.money(total)}</span>
            </div>
          </div>
        ) : null}
        {fee > 0 ? (
          <Checkbox checked={chargeFee} onChange={setChargeFee}>
            {t('ops.new.chargeFee', { amount: fmt.money(fee) })}
          </Checkbox>
        ) : null}
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

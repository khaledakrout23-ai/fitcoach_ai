// Feuilles d'action partagées : renouveler (D6 / M6), encaisser une séance, envoyer un message
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, FormError, Input, Segmented, Sheet, Skeleton, Textarea, useToast, ErrorState, Empty } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { can } from '../../../lib/permissions';
import { CashChange, MemberPicker, MethodChips, PlanPicker, addDays, enabledMethods, localDate, planEnd, round3 } from './shared';

const useWide = () => {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 900px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
};
export { useWide };

/** Montant espèces valide (reçu ≥ total) ou pas d'espèces */
function cashOk(method, received, total) {
  if (method !== 'ESPECES' || received === '') return true;
  const v = Number(String(received).replace(',', '.'));
  return Number.isFinite(v) && v >= total;
}

// ---------------------------------------------------------------- Renouveler l'abonnement
/**
 * member : { id, name } ; subscription : abonnement le plus récent (endDate, plan) ; onDone(result)
 */
export function RenewSheet({ open, onClose, member, subscription, onDone }) {
  const { t, fmt, name } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const methods = enabledMethods(user);
  const plans = useLoad(() => (open ? api.get('/staff/plans') : Promise.resolve(null)), [open]);
  const list = useMemo(() => (plans.data?.plans || []).filter((p) => !p.archived), [plans.data]);
  const [planId, setPlanId] = useState(null);
  const [start, setStart] = useState('AFTER');
  const [method, setMethod] = useState(methods[0]);
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStart('AFTER');
    setMethod(methods[0]);
    setReceived('');
    setError(null);
    setPlanId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // formule actuelle présélectionnée si elle est encore vendue
  useEffect(() => {
    if (!open || planId || !list.length) return;
    const current = subscription?.plan && list.find((p) => p.id === subscription.plan.id);
    setPlanId((current || list.find((p) => p.visible) || list[0]).id);
  }, [open, list, planId, subscription]);

  const plan = list.find((p) => p.id === planId) || null;
  const today = localDate();
  const end = subscription?.endDate;
  const afterDate = end && end >= today ? addDays(end, 1) : today;
  const startDate = start === 'AFTER' ? afterDate : today;
  const total = plan ? round3(plan.price) : 0;
  const valid = Boolean(plan && method) && cashOk(method, received, total);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post(`/staff/members/${member.id}/renew`, { planId: plan.id, method, start });
      toast({ text: t('ops.renew.done', { amount: fmt.money(res.payment.amount) }), icon: 'circle-check' });
      onDone?.(res);
      onClose();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const subtitle = end
    ? t('ops.renew.subtitle', { name: member?.name || '', plan: subscription?.plan ? name(subscription.plan) : '', date: fmt.shortDate(end) })
    : member?.name;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('ops.renew.title')}
      subtitle={subtitle}
      footer={
        <div className="ops-sheet-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" onClick={submit} disabled={!valid} loading={busy} className="grow">
            {t('ops.renew.cta', { amount: fmt.money(total) })}
          </Button>
        </div>
      }
    >
      {plans.loading && !plans.data ? (
        <div className="stack-2">
          <Skeleton h={64} />
          <Skeleton h={64} />
        </div>
      ) : plans.error ? (
        <ErrorState error={plans.error} onRetry={plans.reload} compact />
      ) : !list.length ? (
        <Empty icon="tag" title={t('ops.renew.noPlans')} />
      ) : (
        <div className="stack-4">
          <div className="stack-2">
            <span className="label w500">{t('ops.renew.plan')}</span>
            <PlanPicker plans={list} value={planId} onChange={setPlanId} discounts />
          </div>
          <div className="stack-2">
            <span className="label w500">{t('ops.renew.start')}</span>
            <Segmented
              value={start}
              onChange={setStart}
              label={t('ops.renew.start')}
              options={[
                { value: 'AFTER', label: plan ? t('ops.renew.after', { from: fmt.shortDate(afterDate), to: fmt.shortDate(planEnd(afterDate, plan)) }) : t('ops.renew.afterShort') },
                { value: 'TODAY', label: t('time.today') },
              ]}
            />
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
                  <span className="num">{fmt.shortDate(startDate)}</span> → <span className="num">{fmt.shortDate(planEnd(startDate, plan))}</span>
                </span>
                <span className="num w500">{fmt.money(total)}</span>
              </div>
              <div className="row between">
                <span className="muted">{t('ops.renew.receipt')}</span>
                <span>{t('ops.renew.receiptApp')}</span>
              </div>
            </div>
          ) : null}
          <FormError error={error} />
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Encaisser (accueil) : abonnement d'un membre ou séance unique
export function ChargeSheet({ open, onClose, onDone }) {
  const { t, fmt, name } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const methods = enabledMethods(user);
  const canRenew = can(user, 'members.write');
  const [mode, setMode] = useState(canRenew ? 'MEMBER' : 'SESSION');
  const plans = useLoad(() => (open && mode === 'SESSION' ? api.get('/staff/plans') : Promise.resolve(null)), [open, mode]);
  const dayPlans = (plans.data?.plans || []).filter((p) => !p.archived && p.durationUnit === 'DAY');
  const [planId, setPlanId] = useState(null);
  const [method, setMethod] = useState(methods[0]);
  const [visitor, setVisitor] = useState('');
  const [received, setReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMode(canRenew ? 'MEMBER' : 'SESSION');
    setPlanId(null);
    setVisitor('');
    setReceived('');
    setError(null);
    setMethod(methods[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!planId && dayPlans.length) setPlanId(dayPlans[0].id);
  }, [planId, dayPlans]);

  const plan = dayPlans.find((p) => p.id === planId);
  const total = plan ? round3(plan.price) : 0;
  const valid = Boolean(plan && method) && cashOk(method, received, total);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post('/staff/payments', { planId: plan.id, method, ...(visitor.trim() ? { label: visitor.trim() } : {}) });
      toast({ text: t('ops.charge.done', { amount: fmt.money(res.amount) }), icon: 'circle-check' });
      onDone?.(res);
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
      title={t('ops.charge.title')}
      footer={
        mode === 'SESSION' ? (
          <div className="ops-sheet-actions">
            <Button variant="secondary" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button variant="primary" className="grow" disabled={!valid} loading={busy} onClick={submit}>
              {t('ops.renew.cta', { amount: fmt.money(total) })}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="stack-4">
        {canRenew ? (
          <Segmented
            value={mode}
            onChange={setMode}
            label={t('ops.charge.title')}
            options={[
              { value: 'MEMBER', label: t('ops.charge.member') },
              { value: 'SESSION', label: t('ops.charge.session') },
            ]}
          />
        ) : null}
        {mode === 'MEMBER' ? (
          <>
            <p className="small muted">{t('ops.charge.memberHint')}</p>
            <MemberPicker
              autoFocus
              onPick={(m) => {
                onClose();
                navigate(`/salle/membres/${m.id}?renouveler=1`);
              }}
            />
          </>
        ) : plans.loading && !plans.data ? (
          <Skeleton h={64} />
        ) : plans.error ? (
          <ErrorState error={plans.error} onRetry={plans.reload} compact />
        ) : !dayPlans.length ? (
          <Empty icon="tag" title={t('ops.charge.noDayPlan')} />
        ) : (
          <>
            <PlanPicker plans={dayPlans} value={planId} onChange={setPlanId} />
            <Field label={t('ops.charge.visitor')} optional>
              <Input value={visitor} onChange={(e) => setVisitor(e.target.value.slice(0, 100))} dir="auto" />
            </Field>
            <div className="stack-2">
              <span className="label w500">{t('ops.renew.payment')}</span>
              <MethodChips methods={methods} value={method} onChange={setMethod} />
            </div>
            {method === 'ESPECES' ? <CashChange total={total} received={received} onChange={setReceived} /> : null}
            {plan ? (
              <p className="small muted">
                <span dir="auto">{name(plan)}</span> · <span className="num">{fmt.money(total)}</span>
              </p>
            ) : null}
            <FormError error={error} />
          </>
        )}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Message à un membre (notification dans l'app)
export function MessageSheet({ open, onClose, member, preset }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle(preset?.title || '');
    setBody(preset?.body || '');
    setError(null);
    // le texte proposé n'est repris qu'à l'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = title.trim().length > 0 && body.trim().length > 0;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/staff/members/${member.id}/message`, { title: title.trim(), body: body.trim() });
      toast({ text: t('ops.message.sent'), icon: 'send' });
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
      title={t('ops.message.title')}
      subtitle={member?.name}
      footer={
        <div className="ops-sheet-actions">
          <Button variant="secondary" onClick={onClose}>
            {t('action.cancel')}
          </Button>
          <Button variant="primary" icon="send" className="grow" disabled={!valid} loading={busy} onClick={submit}>
            {t('ops.message.send')}
          </Button>
        </div>
      }
    >
      <div className="stack-4">
        <Field label={t('ops.message.subject')}>
          <Input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} dir="auto" />
        </Field>
        <Field label={t('ops.message.body')} hint={`${body.length} / 500`}>
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value.slice(0, 500))} dir="auto" />
        </Field>
        <p className="small muted">{t('ops.message.hint')}</p>
        <FormError error={error} />
      </div>
    </Sheet>
  );
}

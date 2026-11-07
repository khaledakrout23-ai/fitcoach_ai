// Notifications aux membres (D16 / M11) : nouveau message (public, FR + AR, canal, maintenant / programmé, aperçu),
// envois automatiques, historique avec taux de lecture
import { useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { useLoad } from '../../../lib/hooks';
import {
  Button, IconButton, Field, Input, Textarea, Chip, ToggleRow, Segmented, StatusPill, useToast,
  PageSkeleton, Skeleton, Empty, ErrorState, FormError,
} from '../../../components';
import { PageHead } from './shared';

const AUTOMATIONS = ['expiry', 'calm', 'repaired', 'inactive', 'welcome'];

function toLocalInput(d) {
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Notifications() {
  const { t } = useI18n();
  const audiences = useLoad(() => api.get('/staff/campaigns/audiences'), []);
  const history = useLoad(() => api.get('/staff/campaigns'), []);

  return (
    <>
      <PageHead title={t('manage.notif.title')} subtitle={t('manage.notif.subtitle')} back="/salle/plus" />
      <div className="mg-cols two">
        <Composer audiences={audiences} smsAvailable={Boolean(history.data?.smsAvailable)} inactiveDays={history.data?.automations?.inactive?.days} onSent={() => { history.reload(); audiences.reload(); }} />
        <div className="stack">
          <Automations history={history} />
          <History history={history} />
        </div>
      </div>
    </>
  );
}

function Composer({ audiences, smsAvailable, inactiveDays, onSent }) {
  const { t, tp, fmt, lang } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState({ audience: '', titleFr: '', bodyFr: '', titleAr: '', bodyAr: '', channel: 'APP', when: 'now', at: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e && e.target ? e.target.value : e }));

  const list = audiences.data || [];
  const chosen = list.find((a) => a.audience === form.audience);
  const count = chosen?.count || 0;
  const min = new Date(Date.now() + 5 * 60000);
  const max = new Date(Date.now() + 30 * 86400000);
  const atDate = form.at ? new Date(form.at) : null;
  const atOk = form.when === 'now' || (atDate && atDate >= new Date(Date.now() - 60000) && atDate <= max);
  const valid = form.audience && count > 0 && form.titleFr.trim() && form.bodyFr.trim() && atOk;

  const preview = lang === 'ar' && form.titleAr.trim() ? { title: form.titleAr, body: form.bodyAr, dir: 'rtl' } : { title: form.titleFr, body: form.bodyFr, dir: 'ltr' };

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const body = { audience: form.audience, channel: form.channel, titleFr: form.titleFr.trim(), bodyFr: form.bodyFr.trim() };
      if (form.titleAr.trim()) body.titleAr = form.titleAr.trim();
      if (form.bodyAr.trim()) body.bodyAr = form.bodyAr.trim();
      if (form.when === 'later') body.scheduledAt = new Date(form.at).toISOString();
      const r = await api.post('/staff/campaigns', body);
      toast({ text: r.sentAt ? tp('manage.notif.sent', r.recipients) : t('manage.notif.scheduled', { when: fmt.when(r.scheduledAt) }), icon: 'send' });
      setForm({ audience: '', titleFr: '', bodyFr: '', titleAr: '', bodyAr: '', channel: 'APP', when: 'now', at: '' });
      onSent();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card pad-lg stack-4" onSubmit={submit}>
      <h2 className="card-title">{t('manage.notif.new')}</h2>
      <div className="stack-2">
        <span className="w500">{t('manage.notif.to')}</span>
        {audiences.loading && !audiences.data ? (
          <Skeleton h={44} />
        ) : audiences.error && !audiences.data ? (
          <ErrorState compact error={audiences.error} onRetry={audiences.reload} />
        ) : (
          <div className="chips" role="group" aria-label={t('manage.notif.to')}>
            {list.map((a) => (
              <Chip key={a.audience} selected={form.audience === a.audience} count={a.count} onClick={() => setForm((f) => ({ ...f, audience: a.audience }))}>
                {t(`manage.notif.aud.${a.audience}`, { n: inactiveDays || 14 })}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <div className="mg-fields">
        <div className="stack-2">
          <span className="w500">{t('manage.notif.fr')}</span>
          <Input dir="ltr" lang="fr" value={form.titleFr} maxLength={120} placeholder={t('manage.notif.titlePh')} onChange={set('titleFr')} aria-label={t('manage.notif.titleFr')} />
          <Textarea dir="ltr" lang="fr" rows={4} value={form.bodyFr} maxLength={500} placeholder={t('manage.notif.bodyPh')} onChange={set('bodyFr')} aria-label={t('manage.notif.bodyFr')} />
        </div>
        <div className="stack-2">
          <span className="w500" dir="rtl" style={{ textAlign: 'end' }}>
            العربية
          </span>
          <Input dir="rtl" lang="ar" value={form.titleAr} maxLength={120} placeholder="العنوان" onChange={set('titleAr')} aria-label={t('manage.notif.titleAr')} />
          <Textarea dir="rtl" lang="ar" rows={4} value={form.bodyAr} maxLength={500} placeholder="الرسالة" onChange={set('bodyAr')} aria-label={t('manage.notif.bodyAr')} />
        </div>
      </div>

      <div className="mg-fields">
        <Field label={t('manage.notif.channel')} hint={smsAvailable ? null : t('manage.notif.smsOff')}>
          <div className="mg-states" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <button type="button" className="mg-state" aria-pressed={form.channel === 'APP'} onClick={() => setForm((f) => ({ ...f, channel: 'APP' }))}>
              {t('manage.notif.app')}
            </button>
            <button type="button" className="mg-state" aria-pressed={form.channel === 'SMS'} disabled={!smsAvailable} onClick={() => setForm((f) => ({ ...f, channel: 'SMS' }))}>
              {t('manage.notif.sms')}
            </button>
          </div>
        </Field>
        <Field label={t('manage.notif.when')}>
          <Segmented
            options={[
              { value: 'now', label: t('manage.notif.now') },
              { value: 'later', label: t('manage.notif.later') },
            ]}
            value={form.when}
            onChange={(v) => setForm((f) => ({ ...f, when: v, at: v === 'later' && !f.at ? toLocalInput(new Date(Date.now() + 86400000)) : f.at }))}
            label={t('manage.notif.when')}
          />
        </Field>
      </div>
      {form.when === 'later' ? (
        <Field label={t('manage.notif.at')} error={atOk ? null : t('manage.notif.atInvalid')}>
          <Input type="datetime-local" value={form.at} min={toLocalInput(min)} max={toLocalInput(max)} onChange={set('at')} invalid={!atOk} />
        </Field>
      ) : null}

      <div className="stack-2">
        <span className="caption muted">{t('manage.notif.preview')}</span>
        <div className="mg-preview">
          <img src="/brand/kammel-symbol.png" alt="" />
          <div className="grow" dir={preview.dir}>
            <div className="w500">{preview.title || t('manage.notif.titlePh')}</div>
            <div className="small muted" style={{ whiteSpace: 'pre-line' }}>
              {preview.body || t('manage.notif.bodyPh')}
            </div>
          </div>
        </div>
      </div>

      <FormError error={error} />
      <div className="row between wrap">
        <span className="small muted">{t('manage.notif.eachLang')}</span>
        <Button variant="primary" type="submit" icon="send" disabled={!valid} loading={saving}>
          {form.audience
            ? form.when === 'later'
              ? tp('manage.notif.scheduleFor', count)
              : tp('manage.notif.sendTo', count)
            : t('manage.notif.pickAudience')}
        </Button>
      </div>
    </form>
  );
}

function Automations({ history }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(null);
  const a = history.data?.automations;
  const calm = user?.gym?.settings?.live?.calmThreshold;

  async function toggle(key, enabled) {
    setBusy(key);
    try {
      const next = await api.put('/staff/campaigns/automations', { [key]: { enabled } });
      history.setData((d) => ({ ...d, automations: next }));
      toast({ text: enabled ? t('manage.notif.autoOn') : t('manage.notif.autoOff'), icon: 'check' });
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  const sub = (k) => {
    if (k === 'expiry') return t('manage.notif.autoSub.expiry', { n: a.expiry.daysBefore, h: `${String(a.expiry.hour).padStart(2, '0')}:00` });
    if (k === 'calm') return calm != null ? t('manage.notif.autoSub.calm', { n: calm }) : t('manage.notif.autoSub.calmAny');
    if (k === 'inactive') return t('manage.notif.autoSub.inactive', { n: a.inactive.days });
    return t(`manage.notif.autoSub.${k}`);
  };

  return (
    <section className="card pad-lg stack-2">
      <h2 className="card-title">{t('manage.notif.autos')}</h2>
      {!a ? (
        history.error ? <ErrorState compact error={history.error} onRetry={history.reload} /> : <Skeleton h={200} />
      ) : (
        AUTOMATIONS.map((k) => <ToggleRow key={k} title={t(`manage.notif.auto.${k}`)} subtitle={sub(k)} checked={a[k].enabled} disabled={busy === k} onChange={(v) => toggle(k, v)} />)
      )}
    </section>
  );
}

function History({ history }) {
  const { t, fmt, lang } = useI18n();
  const { toast } = useToast();
  const items = history.data?.items;

  async function cancel(c) {
    try {
      await api.del(`/staff/campaigns/${c.id}`);
      toast({ text: t('manage.notif.cancelled'), icon: 'check' });
      history.reload();
    } catch (err) {
      toast({ text: err.message, tone: 'error' });
    }
  }

  return (
    <section className="card pad-lg stack-2">
      <h2 className="card-title">{t('manage.notif.history')}</h2>
      {!items ? (
        history.error ? null : <PageSkeleton cards={2} />
      ) : items.length === 0 ? (
        <Empty icon="bell" title={t('manage.notif.none')} />
      ) : (
        <div className="table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>{t('manage.notif.colSent')}</th>
                <th>{t('manage.notif.colWhen')}</th>
                <th>{t('manage.notif.colRead')}</th>
                <th aria-label={t('manage.notif.colKind')} />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <span className="w500" style={{ display: 'block' }} dir="auto">
                      {lang === 'ar' && c.titleAr ? c.titleAr : c.titleFr}
                    </span>
                    <span className="caption muted">
                      {t(`manage.notif.aud.${c.audience}`, { n: history.data.automations?.inactive?.days ?? 14 })} · <span className="num">{fmt.num(c.recipients)}</span>
                    </span>
                  </td>
                  <td className="small muted" data-label={t('manage.notif.colWhen')}>
                    {fmt.when(c.sentAt || c.scheduledAt)}
                  </td>
                  <td data-label={t('manage.notif.colRead')}>
                    {c.readRate != null ? <span className="num w500">{fmt.percent(c.readRate)}</span> : <span className="muted">–</span>}
                  </td>
                  <td className="actions-cell">
                    {c.status === 'SCHEDULED' ? (
                      <span className="row-2" style={{ justifyContent: 'flex-end' }}>
                        <StatusPill tone="hydro" icon="clock">{t('manage.notif.programmed')}</StatusPill>
                        <IconButton icon="x" size={18} label={t('manage.notif.cancel')} onClick={() => cancel(c)} />
                      </span>
                    ) : c.auto ? (
                      <StatusPill>{t('manage.notif.auto')}</StatusPill>
                    ) : (
                      <StatusPill tone="ember">{t('manage.notif.manual')}</StatusPill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

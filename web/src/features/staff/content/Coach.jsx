// Coach Kammel (D15) : tendances anonymes des 7 derniers jours (jamais le contenu des messages) + réglages du coach
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useLoad } from '../../../lib/hooks';
import { Button, Field, Input, ToggleRow, Chip, Icon, Kpi, useToast, PageSkeleton, Empty, ErrorState, FormError } from '../../../components';
import { PageHead, BarRow, useMeta } from '../manage/shared';

const SAFETY = ['notMedical', 'physioAfter3Days', 'noSupplements'];
const COACH_LANGS = ['fr', 'derja', 'en'];

export default function Coach() {
  const { t, fmt, label } = useI18n();
  const meta = useMeta();
  const data = useLoad(() => api.get('/staff/content/coach'), []);
  const d = data.data;
  const head = <PageHead title={t('content.coach.title')} subtitle={t('content.coach.subtitle', { n: d?.analytics.days || 7 })} back="/salle/plus" />;
  if (data.loading && !d) return (<>{head}<PageSkeleton cards={4} /></>);
  if (data.error && !d) return (<>{head}<ErrorState error={data.error} onRetry={data.reload} /></>);
  const a = d.analytics;
  const maxPain = Math.max(1, ...a.painZones.map((z) => z.count));

  return (
    <>
      {head}
      <div className="kpi-grid">
        <Kpi label={t('content.coach.conversations')} value={fmt.num(a.conversations)} />
        <Kpi label={t('content.coach.members')} value={fmt.num(a.membersUsing)} />
        <Kpi label={t('content.coach.applied')} value={fmt.num(a.proposalsApplied)} />
        <Kpi label={t('content.coach.referrals')} value={fmt.num(a.physioReferrals)} />
      </div>
      <div className="mg-cols">
        <section className="card pad-lg stack">
          <h2 className="card-title">{t('content.coach.topics')}</h2>
          {a.questions === 0 ? (
            <Empty icon="message-circle" title={t('content.coach.noQuestions')} />
          ) : (
            a.topics.map((tp) => <BarRow key={tp.topic} label={label(meta.data?.coachTopics?.[tp.topic])} value={fmt.percent(tp.pct)} pct={tp.pct} />)
          )}
        </section>
        <section className="card pad-lg stack">
          <div>
            <h2 className="card-title">{t('content.coach.pains')}</h2>
            <p className="caption muted">{t('content.coach.painsSub')}</p>
          </div>
          {a.painZones.length === 0 ? (
            <Empty icon="circle-check" title={t('content.coach.noPains')} />
          ) : (
            a.painZones.map((z) => <BarRow key={z.zone} tone="text" label={label(meta.data?.injuryZones?.[z.zone])} value={fmt.num(z.count)} pct={(z.count / maxPain) * 100} />)
          )}
          <p className="small muted row-2">
            <Icon name="lock" size={16} />
            {t('content.coach.privacy')}
          </p>
        </section>
        <CoachSettings initial={d.settings} onSaved={(s) => data.setData((x) => ({ ...x, settings: s }))} />
      </div>
    </>
  );
}

function CoachSettings({ initial, onSaved }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const anyLang = COACH_LANGS.some((l) => form.languages[l]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const r = await api.put('/staff/content/coach', form);
      onSaved(r);
      toast({ text: t('content.coach.saved'), icon: 'check' });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card pad-lg stack-2">
      <h2 className="card-title">{t('content.coach.settings')}</h2>
      <ToggleRow title={t('content.coach.enabled')} subtitle={t('content.coach.enabledSub')} checked={form.enabled} onChange={(v) => set({ enabled: v })} />
      <ToggleRow title={t('content.coach.propose')} subtitle={t('content.coach.proposeSub')} checked={form.proposeChanges} onChange={(v) => set({ proposeChanges: v })} />
      <ToggleRow title={t('content.coach.addPain')} subtitle={t('content.coach.addPainSub')} checked={form.addPainWithConsent} onChange={(v) => set({ addPainWithConsent: v })} />
      <span className="w500 mt-2">{t('content.coach.languages')}</span>
      <div className="chips">
        {COACH_LANGS.map((l) => (
          <Chip key={l} selected={form.languages[l]} onClick={() => set({ languages: { ...form.languages, [l]: !form.languages[l] } })}>
            {t(`content.coach.lang.${l}`)}
          </Chip>
        ))}
      </div>
      {!anyLang ? <p className="small danger-text">{t('content.coach.langRequired')}</p> : null}
      <span className="w500 mt-2">{t('content.coach.safety')}</span>
      {SAFETY.map((k) => (
        <ToggleRow key={k} title={t(`content.coach.safety.${k}`)} checked={form.safety[k]} onChange={(v) => set({ safety: { ...form.safety, [k]: v } })} />
      ))}
      <span className="w500 mt-2">{t('content.coach.physio')}</span>
      <div className="mg-fields">
        <Field label={t('content.coach.physioName')}>
          <Input value={form.physio.name} maxLength={80} onChange={(e) => set({ physio: { ...form.physio, name: e.target.value } })} />
        </Field>
        <Field label={t('content.coach.physioPhone')}>
          <Input value={form.physio.phone} dir="ltr" inputMode="tel" maxLength={30} onChange={(e) => set({ physio: { ...form.physio, phone: e.target.value } })} />
        </Field>
      </div>
      <FormError error={error} />
      <Button variant="primary" block onClick={save} disabled={!dirty || !anyLang} loading={saving}>
        {t('action.save')}
      </Button>
    </section>
  );
}

// Pannes (D11 / M8 / M9) : Nouveaux · En cours · Réparées (7 jours), détail, suivi, signalement par l'équipe
import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../../lib/api';
import { useI18n } from '../../../lib/i18n';
import { useAuth } from '../../../lib/auth';
import { can } from '../../../lib/permissions';
import { useLoad } from '../../../lib/hooks';
import { shrinkPhoto } from '../../../lib/photo';
import {
  Button, IconButton, Field, Select, Textarea, ToggleRow, ChipGroup, Sheet, useToast, Avatar,
  PageSkeleton, Skeleton, Empty, ErrorState, FormError, OfflineBanner,
} from '../../../components';
import { PageHead, ReportStatus, Thumb, machineName, useMedia, useMeta } from './shared';

const STATES = ['NOUVEAU', 'VU', 'REPARATION', 'REPAREE'];

export default function Reports() {
  const { t } = useI18n();
  const { user } = useAuth();
  const outlet = useOutletContext() || {};
  const wide = useMedia('(min-width: 1100px)');
  const board = useLoad(() => api.get('/staff/reports'), []);
  const [selected, setSelected] = useState(null); // id du signalement principal
  const [creating, setCreating] = useState(false);
  const canCreate = can(user, 'reports.create');

  const columns = board.data?.columns;
  // grand écran : le premier signalement est ouvert d'office dans le panneau de droite
  useEffect(() => {
    if (!wide || selected || !columns) return;
    const first = columns.nouveaux[0] || columns.enCours[0] || columns.reparees[0];
    if (first) setSelected(first.mainReportId);
  }, [wide, columns, selected]);

  function refresh() {
    board.reload();
    outlet.reloadCounts?.();
  }

  const head = (
    <PageHead
      title={t('manage.reports.title')}
      subtitle={<span className="desk-sub">{t('manage.reports.subtitle')}</span>}
      actions={
        canCreate ? (
          <>
            <IconButton icon="plus" label={t('manage.reports.create')} className="only-phone" onClick={() => setCreating(true)} />
            <Button variant="primary" icon="plus" className="hide-phone" onClick={() => setCreating(true)}>
              {t('manage.reports.create')}
            </Button>
          </>
        ) : null
      }
    />
  );

  let body;
  if (board.loading && !board.data) body = <PageSkeleton cards={4} />;
  else if (board.error && !board.data) body = <ErrorState error={board.error} onRetry={board.reload} />;
  else {
    const total = columns.nouveaux.length + columns.enCours.length + columns.reparees.length;
    const list = (
      <div className="stack-2">
        {total === 0 ? <Empty icon="circle-check" title={t('manage.reports.empty')}>{t('manage.reports.emptyHint')}</Empty> : null}
        <Column title={t('manage.reports.colNew')} items={columns.nouveaux} kind="new" selected={selected} onSelect={setSelected} />
        <Column title={t('manage.reports.colProgress')} items={columns.enCours} kind="progress" selected={selected} onSelect={setSelected} />
        <Column title={t('manage.reports.colDone')} items={columns.reparees} kind="done" selected={selected} onSelect={setSelected} />
      </div>
    );
    body = wide ? (
      <div className="split detail">
        {list}
        <aside className="card pad-lg mg-panel">
          {selected ? (
            <ReportDetail key={selected} id={selected} assignees={board.data.assignees} onSaved={refresh} />
          ) : (
            <Empty icon="wrench" title={t('manage.reports.pick')} />
          )}
        </aside>
      </div>
    ) : (
      <>
        {list}
        <Sheet open={Boolean(selected)} onClose={() => setSelected(null)} variant="drawer" labelledBy="report-title">
          {selected ? <ReportDetail key={selected} id={selected} assignees={board.data.assignees} onSaved={() => { refresh(); setSelected(null); }} /> : null}
        </Sheet>
      </>
    );
  }

  return (
    <>
      {head}
      <OfflineBanner text={t('manage.offline')} />
      {body}
      {creating ? (
        <CreateReport
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setCreating(false);
            refresh();
            setSelected(r.id);
          }}
        />
      ) : null}
    </>
  );
}

function Column({ title, items, kind, selected, onSelect }) {
  const { t, tp, fmt, label } = useI18n();
  const meta = useMeta();
  if (!items.length) return null;
  return (
    <section className="stack-2" aria-label={title}>
      <h2 className="mg-section-title">{title}</h2>
      <div className="mg-list">
        {items.map((g) => {
          const issue = label(meta.data?.issueTypes?.[g.issueType]) || '';
          let sub;
          if (kind === 'done') {
            sub = [t('manage.reports.repairedOn', { date: fmt.shortDate(g.repairedAt) }), g.notified ? tp('manage.reports.notified', g.notified) : null];
          } else if (g.status === 'REPARATION') {
            sub = [t('manage.reports.since', { date: fmt.shortDate(g.repairStartedAt || g.firstAt) }), g.internalNote || g.assignedTo?.name];
          } else {
            sub = [fmt.when(g.latestAt), tp('manage.reports.reportsCount', g.count), g.hasPhoto ? t('manage.reports.photo') : null, g.assignedTo?.name];
          }
          return (
            <button
              key={g.mainReportId}
              type="button"
              className={`mg-item ${selected === g.mainReportId ? 'selected' : ''}`}
              aria-pressed={selected === g.mainReportId}
              onClick={() => onSelect(g.mainReportId)}
            >
              <Thumb icon={g.hasPhoto ? 'camera' : 'wrench'} />
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>
                  <span dir="auto">{g.machine.label}</span> {g.machine.code ? <span className="code num">#{g.machine.code}</span> : null}
                  <span className="hide-phone"> · {issue}</span>
                </span>
                <span className="sub phone-block">{issue}</span>
                <span className="sub hide-phone" style={{ display: 'block' }} dir="auto">
                  {sub.filter(Boolean).join(' · ')}
                </span>
              </span>
              <ReportStatus status={g.status} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ReportDetail({ id, assignees, onSaved }) {
  const { t, tp, fmt, label } = useI18n();
  const { user } = useAuth();
  const { toast } = useToast();
  const meta = useMeta();
  const detail = useLoad(() => api.get(`/staff/reports/${id}`), [id]);
  const writable = can(user, 'reports.write');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const d = detail.data;
  useEffect(() => {
    if (d) setForm({ status: d.status, assignedToId: d.assignedTo ? String(d.assignedTo.id) : '', outOfService: Boolean(d.machine?.outOfService), internalNote: d.internalNote || '' });
  }, [d]);

  if (detail.loading && !d) {
    return (
      <div className="stack">
        <Skeleton line w="60%" />
        <Skeleton h={160} card />
        <Skeleton h={80} card />
      </div>
    );
  }
  if (detail.error && !d) return <ErrorState error={detail.error} onRetry={detail.reload} />;
  if (!form) return null;

  const issue = label(meta.data?.issueTypes?.[d.issueType]) || '';
  const photo = d.reporters.find((r) => r.hasPhoto);
  const wantsNotice = d.reporters.some((r) => r.notify && r.author?.role === 'SPORTIF');
  const dirty =
    form.status !== d.status ||
    form.assignedToId !== (d.assignedTo ? String(d.assignedTo.id) : '') ||
    form.outOfService !== Boolean(d.machine?.outOfService) ||
    form.internalNote !== (d.internalNote || '');

  async function save(extra = {}) {
    setSaving(true);
    setError(null);
    const body = { ...extra };
    if (!extra.status && form.status !== d.status) body.status = form.status;
    if (form.assignedToId !== (d.assignedTo ? String(d.assignedTo.id) : '')) body.assignedToId = form.assignedToId ? Number(form.assignedToId) : null;
    if (form.outOfService !== Boolean(d.machine?.outOfService)) body.outOfService = form.outOfService;
    if (form.internalNote !== (d.internalNote || '')) body.internalNote = form.internalNote;
    try {
      const r = await api.put(`/staff/reports/${id}`, body);
      toast({ text: r.notified ? tp('manage.reports.savedNotified', r.notified) : t('manage.reports.saved'), icon: 'check' });
      onSaved();
      detail.reload();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack-4">
      <div className="row-top between" style={{ display: 'flex', gap: 12 }}>
        <div className="grow">
          <h2 id="report-title" className="h2">
            <span dir="auto">{d.machine.label}</span> {d.machine.code ? <span className="num muted">#{d.machine.code}</span> : null}
          </h2>
          <p className="small muted">
            {d.machine.zone} · {issue}
          </p>
        </div>
        <ReportStatus status={d.status} />
      </div>

      {photo ? (
        <figure className="stack-2" style={{ margin: 0 }}>
          <figcaption className="caption muted">{photo.author?.role === 'SPORTIF' ? t('manage.reports.photoMember') : t('manage.reports.photoStaff')}</figcaption>
          <img className="mg-photo" src={api.url(`/staff/reports/${photo.reportId}/photo`)} alt={t('manage.reports.photoAlt', { name: machineName(d.machine) })} />
        </figure>
      ) : null}

      <div className="stack-2">
        {d.reporters.map((r) => (
          <div key={r.reportId} className="mg-quote stack-2">
            {r.description ? (
              <p className="w500" dir="auto">
                « {r.description} »
              </p>
            ) : (
              <p className="w500">{label(meta.data?.issueTypes?.[r.issueType])}</p>
            )}
            <p className="caption muted">
              {[r.author ? r.author.name : t('manage.reports.deletedUser'), fmt.when(r.at), r.notify && r.author?.role === 'SPORTIF' ? t('manage.reports.wantsNotice') : null].filter(Boolean).join(' · ')}
            </p>
          </div>
        ))}
      </div>

      {writable ? (
        <>
          <div className="stack-2">
            <span className="w500">{t('manage.reports.state')}</span>
            <div className="mg-states" role="group" aria-label={t('manage.reports.state')}>
              {STATES.map((s) => (
                <button key={s} type="button" className="mg-state" aria-pressed={form.status === s} onClick={() => setForm((f) => ({ ...f, status: s }))}>
                  {t(`manage.reportStatus.${s}`)}
                </button>
              ))}
            </div>
          </div>
          <Field label={t('manage.reports.assigned')}>
            <Select value={form.assignedToId} onChange={(e) => setForm((f) => ({ ...f, assignedToId: e.target.value }))}>
              <option value="">{t('manage.reports.nobody')}</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {t(`role.${a.role}`)}
                </option>
              ))}
            </Select>
          </Field>
          {form.status !== 'REPAREE' ? (
            <ToggleRow
              title={t('manage.reports.oos')}
              subtitle={t('manage.reports.oosHint')}
              checked={form.outOfService}
              onChange={(v) => setForm((f) => ({ ...f, outOfService: v }))}
            />
          ) : null}
          <Field label={t('manage.reports.note')} optional>
            <Textarea rows={3} maxLength={500} value={form.internalNote} placeholder={t('manage.reports.notePh')} onChange={(e) => setForm((f) => ({ ...f, internalNote: e.target.value }))} />
          </Field>
          <FormError error={error} />
          <Button variant="primary" block size="lg" disabled={!dirty} loading={saving} onClick={() => save()}>
            {form.status === 'REPAREE' && d.status !== 'REPAREE' && wantsNotice ? t('manage.reports.saveNotify') : t('action.save')}
          </Button>
          {d.status !== 'REJETE' && d.status !== 'REPAREE' ? (
            <Button variant="text" size="sm" onClick={() => save({ status: 'REJETE' })} disabled={saving}>
              {t('manage.reports.reject')}
            </Button>
          ) : null}
        </>
      ) : (
        <div className="stack-2">
          <div className="mg-kv">
            <span>{t('manage.reports.assigned')}</span>
            <span>{d.assignedTo ? d.assignedTo.name : t('manage.reports.nobody')}</span>
          </div>
          {d.machine.outOfService ? <p className="small danger-text">{t('manage.reports.oos')}</p> : null}
          <p className="caption muted">{t('manage.reports.readOnly')}</p>
        </div>
      )}
      {d.assignedTo && writable ? (
        <div className="row caption muted">
          <Avatar name={d.assignedTo.name} size="sm" />
          <span>{t('manage.reports.assignedTo', { name: d.assignedTo.name })}</span>
        </div>
      ) : null}
    </div>
  );
}

function CreateReport({ onClose, onCreated }) {
  const { t, label } = useI18n();
  const { toast } = useToast();
  const meta = useMeta();
  const machines = useLoad(() => api.get('/staff/machines'), []);
  const fileRef = useRef(null);
  const [form, setForm] = useState({ machineId: '', issueType: '', description: '', photo: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const valid = form.machineId && form.issueType;
  const issueOptions = Object.entries(meta.data?.issueTypes || {}).map(([value, l]) => ({ value, label: label(l) }));

  async function onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const photo = await shrinkPhoto(file);
      setForm((f) => ({ ...f, photo }));
    } catch {
      setError({ code: 'PHOTO_INVALID' });
    }
  }

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const body = { machineId: Number(form.machineId), issueType: form.issueType };
      if (form.description.trim()) body.description = form.description.trim();
      if (form.photo) body.photo = form.photo;
      const r = await api.post('/staff/reports', body);
      toast({ text: t('manage.reports.created'), icon: 'check' });
      onCreated(r);
    } catch (err) {
      setError(err);
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('manage.reports.create')}
      footer={
        <Button variant="primary" block type="submit" form="report-form" disabled={!valid} loading={saving}>
          {t('manage.reports.send')}
        </Button>
      }
    >
      <form id="report-form" className="stack-4" onSubmit={submit}>
        <Field label={t('manage.machines.machine')}>
          <Select value={form.machineId} onChange={(e) => setForm((f) => ({ ...f, machineId: e.target.value }))} required>
            <option value="">{machines.loading ? t('state.loading') : t('manage.choose')}</option>
            {(machines.data?.items || []).map((m) => (
              <option key={m.id} value={m.id}>
                {machineName(m)} · {m.zone}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('manage.reports.issue')}>
          <ChipGroup options={issueOptions} value={form.issueType} onChange={(v) => setForm((f) => ({ ...f, issueType: v }))} label={t('manage.reports.issue')} />
        </Field>
        <Field label={t('manage.reports.description')} optional>
          <Textarea rows={3} maxLength={500} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="row">
          <Button icon="camera" size="sm" onClick={() => fileRef.current?.click()}>
            {form.photo ? t('manage.reports.photoChange') : t('manage.reports.photoAdd')}
          </Button>
          {form.photo ? <img src={form.photo} alt="" className="mg-thumb" style={{ objectFit: 'cover' }} /> : null}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={onPhoto} />
        </div>
        <FormError error={error} />
      </form>
    </Sheet>
  );
}

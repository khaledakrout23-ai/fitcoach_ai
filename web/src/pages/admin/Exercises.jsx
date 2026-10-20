import { useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Field, Modal, Spinner, useLoad, useToast } from '../../components/ui';

const EMPTY = {
  nameFr: '', nameAr: '', nameEn: '', primaryMuscle: '', secondaryMuscles: [], pattern: '', equipmentId: '', accessories: [],
  difficulty: 1, injuryZones: [], defaultReps: '8-12', benefitsFr: [], benefitsAr: [], mistakesFr: [], mistakesAr: [], videoUrl: '',
};

const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function Toggles({ options, value, onChange }) {
  return (
    <div className="chips">
      {options.map(([code, label]) => (
        <button
          type="button"
          key={code}
          className={`chip-toggle${value.includes(code) ? ' on' : ''}`}
          aria-pressed={value.includes(code)}
          onClick={() => onChange(value.includes(code) ? value.filter((x) => x !== code) : [...value, code])}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ExerciseForm({ initial, equipment, onClose, onSaved }) {
  const { t, meta, muscle, pattern, zone, name } = useI18n();
  const [v, setV] = useState({ ...EMPTY, ...initial, equipmentId: initial?.equipmentId || '', videoUrl: initial?.videoUrl || '' });
  const [text, setText] = useState({
    benefitsFr: (initial?.benefitsFr || []).join('\n'),
    benefitsAr: (initial?.benefitsAr || []).join('\n'),
    mistakesFr: (initial?.mistakesFr || []).join('\n'),
    mistakesAr: (initial?.mistakesAr || []).join('\n'),
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });
  const setText2 = (k) => (e) => setText({ ...text, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError(null);
    const body = {
      ...v,
      equipmentId: Number(v.equipmentId),
      difficulty: Number(v.difficulty),
      videoUrl: v.videoUrl || null,
      benefitsFr: lines(text.benefitsFr),
      benefitsAr: lines(text.benefitsAr),
      mistakesFr: lines(text.mistakesFr),
      mistakesAr: lines(text.mistakesAr),
    };
    delete body.id;
    delete body.equipment;
    delete body.createdAt;
    delete body.updatedAt;
    try {
      if (initial?.id) await api(`/admin/exercises/${initial.id}`, { method: 'PUT', body });
      else await api('/admin/exercises', { method: 'POST', body });
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  const muscles = Object.keys(meta.muscles).map((m) => [m, muscle(m)]);
  const zones = Object.keys(meta.injuryZones).map((z) => [z, zone(z)]);
  const accessories = equipment.filter((eq) => eq.code !== 'poids_du_corps').map((eq) => [eq.code, name(eq)]);

  return (
    <Modal title={initial?.id ? t('exercises.edit') : t('exercises.add')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label={t('exercises.nameFr')}>
            <input value={v.nameFr} onChange={set('nameFr')} required />
          </Field>
          <Field label={t('exercises.nameAr')}>
            <input dir="rtl" value={v.nameAr} onChange={set('nameAr')} required />
          </Field>
          <Field label={t('exercises.nameEn')} hint={t('exercises.nameEnHint')}>
            <input dir="ltr" value={v.nameEn} onChange={set('nameEn')} required />
          </Field>
          <Field label={t('exercises.reps')}>
            <input value={v.defaultReps} onChange={set('defaultReps')} />
          </Field>
          <Field label={t('exercises.primary')}>
            <select value={v.primaryMuscle} onChange={set('primaryMuscle')} required>
              <option value="">—</option>
              {muscles.map(([c, l]) => (
                <option key={c} value={c}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('exercises.pattern')}>
            <select value={v.pattern} onChange={set('pattern')} required>
              <option value="">—</option>
              {Object.keys(meta.patterns).map((p) => (
                <option key={p} value={p}>
                  {pattern(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('exercises.equipment')}>
            <select value={v.equipmentId} onChange={set('equipmentId')} required>
              <option value="">—</option>
              {equipment.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  {name(eq)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('exercises.difficulty')}>
            <select value={v.difficulty} onChange={set('difficulty')}>
              {[1, 2, 3].map((d) => (
                <option key={d} value={d}>
                  {t(`exercises.diff${d}`)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="field">
          <span>{t('exercises.secondary')}</span>
          <Toggles options={muscles} value={v.secondaryMuscles} onChange={(x) => setV({ ...v, secondaryMuscles: x })} />
        </div>
        <div className="field">
          <span>{t('exercises.accessories')}</span>
          <Toggles options={accessories} value={v.accessories} onChange={(x) => setV({ ...v, accessories: x })} />
        </div>
        <div className="field">
          <span>{t('exercises.zones')}</span>
          <Toggles options={zones} value={v.injuryZones} onChange={(x) => setV({ ...v, injuryZones: x })} />
        </div>

        <div className="form-grid">
          <Field label={t('exercises.benefitsFr')} hint={t('exercises.oneLine')}>
            <textarea value={text.benefitsFr} onChange={setText2('benefitsFr')} />
          </Field>
          <Field label={t('exercises.benefitsAr')} hint={t('exercises.oneLine')}>
            <textarea dir="rtl" value={text.benefitsAr} onChange={setText2('benefitsAr')} />
          </Field>
          <Field label={t('exercises.mistakesFr')} hint={t('exercises.oneLine')}>
            <textarea value={text.mistakesFr} onChange={setText2('mistakesFr')} />
          </Field>
          <Field label={t('exercises.mistakesAr')} hint={t('exercises.oneLine')}>
            <textarea dir="rtl" value={text.mistakesAr} onChange={setText2('mistakesAr')} />
          </Field>
        </div>
        <Field label={t('exercises.video')} hint={t('exercises.videoHint')}>
          <input dir="ltr" type="url" value={v.videoUrl} onChange={set('videoUrl')} placeholder="https://www.youtube.com/watch?v=..." />
        </Field>

        <ErrorText error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Exercises() {
  const { t, name, muscle, meta } = useI18n();
  const [filter, setFilter] = useState('');
  const [q, setQ] = useState('');
  const exercises = useLoad(() => api(`/exercises?muscle=${filter}&q=${encodeURIComponent(q)}`), [filter, q]);
  const equipment = useLoad(() => api('/equipment'));
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [toast, showToast] = useToast();

  async function remove(ex) {
    if (!window.confirm(t('exercises.confirmDelete', { name: name(ex) }))) return;
    try {
      await api(`/admin/exercises/${ex.id}`, { method: 'DELETE' });
      exercises.reload();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <div className="page">
      {toast}
      <div className="page-head">
        <div>
          <h1>{t('nav.exercises')}</h1>
          <p className="page-sub">{t('exercises.sub', { n: exercises.data?.length ?? '…' })}</p>
        </div>
        <button className="btn" onClick={() => setEditing({})}>
          {t('exercises.add')}
        </button>
      </div>
      <div className="inline">
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 'auto' }} aria-label={t('exercises.primary')}>
          <option value="">{t('exercises.allMuscles')}</option>
          {Object.keys(meta.muscles).map((m) => (
            <option key={m} value={m}>
              {muscle(m)}
            </option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} aria-label={t('common.search')} style={{ maxWidth: 260 }} />
      </div>
      <ErrorText error={error} />

      {exercises.loading && !exercises.data ? (
        <Spinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('exercises.name')}</th>
                <th>{t('exercises.primary')}</th>
                <th>{t('exercises.equipment')}</th>
                <th>{t('exercises.video')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(exercises.data || []).map((ex) => (
                <tr key={ex.id}>
                  <td>
                    <strong>{name(ex)}</strong>
                    <div className="small muted">{ex.nameEn}</div>
                  </td>
                  <td>{muscle(ex.primaryMuscle)}</td>
                  <td>{name(ex.equipment)}</td>
                  <td>{ex.videoUrl ? <span className="badge badge-ok">{t('exercises.hasVideo')}</span> : <span className="badge">{t('exercises.noVideo')}</span>}</td>
                  <td style={{ textAlign: 'end' }}>
                    <div className="inline" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-small btn-ghost" onClick={() => setEditing(ex)}>
                        {t('common.edit')}
                      </button>
                      <button className="btn btn-small btn-ghost" onClick={() => remove(ex)}>
                        {t('common.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && equipment.data && (
        <ExerciseForm
          initial={editing}
          equipment={equipment.data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            exercises.reload();
            showToast(t('exercises.saved'));
          }}
        />
      )}
    </div>
  );
}

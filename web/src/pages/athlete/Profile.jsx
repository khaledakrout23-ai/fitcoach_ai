import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useAuth } from '../../auth';
import { useI18n } from '../../i18n';
import { ErrorText, Field, useLoad, useToast } from '../../components/ui';
import { profileComplete } from './Home';

const GOALS = ['PRISE_MASSE', 'PERTE_POIDS', 'FORCE', 'FORME'];
const LEVELS = ['DEBUTANT', 'INTERMEDIAIRE', 'AVANCE'];

export default function Profile() {
  const { user, setUser } = useAuth();
  const { t, meta, zone, setLang } = useI18n();
  const navigate = useNavigate();
  const gyms = useLoad(() => api('/gyms'));
  const [toast, showToast] = useToast();
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({
    name: user.name || '',
    language: user.language || 'fr',
    gymId: user.gymId || '',
    goal: user.goal || '',
    level: user.level || '',
    daysPerWeek: user.daysPerWeek || 3,
    age: user.age || '',
    height: user.height || '',
    weight: user.weight || '',
    injuries: user.injuries || [],
    healthConsent: Boolean(user.healthConsent),
  });

  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleZone = (z) => setV({ ...v, injuries: v.injuries.includes(z) ? v.injuries.filter((x) => x !== z) : [...v.injuries, z] });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const wasComplete = profileComplete(user);
    try {
      const body = {
        ...v,
        gymId: v.gymId ? Number(v.gymId) : null,
        daysPerWeek: Number(v.daysPerWeek),
        age: v.age ? Number(v.age) : null,
        height: v.height ? Number(v.height) : null,
        weight: v.healthConsent && v.weight ? Number(v.weight) : null,
        injuries: v.healthConsent ? v.injuries : [],
      };
      const fresh = await api('/me/profile', { method: 'PUT', body });
      setUser(fresh);
      setLang(fresh.language);
      if (!wasComplete && profileComplete(fresh)) navigate('/app/programme');
      else showToast(t('profile.saved'));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page-narrow">
      {toast}
      <div>
        <h1>{t('profile.title')}</h1>
        <p className="page-sub">{t('profile.sub')}</p>
      </div>

      <form className="panel stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label={t('auth.name')}>
            <input value={v.name} onChange={set('name')} required />
          </Field>
          <Field label={t('profile.language')}>
            <select value={v.language} onChange={set('language')}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </select>
          </Field>
          <Field label={t('profile.gym')}>
            <select value={v.gymId} onChange={set('gymId')} required>
              <option value="">{t('profile.chooseGym')}</option>
              {(gyms.data || []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.city}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('profile.days')}>
            <select value={v.daysPerWeek} onChange={set('daysPerWeek')}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {t('profile.daysN', { n })}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('profile.goal')}>
            <select value={v.goal} onChange={set('goal')} required>
              <option value="">—</option>
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {t(`goal.${g}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('profile.level')}>
            <select value={v.level} onChange={set('level')} required>
              <option value="">—</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`level.${l}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('profile.age')}>
            <input type="number" min="12" max="90" value={v.age} onChange={set('age')} />
          </Field>
          <Field label={t('profile.height')}>
            <input type="number" min="120" max="230" value={v.height} onChange={set('height')} />
          </Field>
        </div>

        <fieldset className="stack" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
          <legend style={{ fontWeight: 600, padding: '0 6px' }}>{t('profile.health')}</legend>
          <label className="check">
            <input type="checkbox" checked={v.healthConsent} onChange={set('healthConsent')} />
            {t('profile.consent')}
          </label>
          {v.healthConsent && (
            <>
              <Field label={t('profile.weight')}>
                <input type="number" min="30" max="250" step="0.5" value={v.weight} onChange={set('weight')} />
              </Field>
              <div className="field">
                <span>{t('profile.injuries')}</span>
                <div className="chips">
                  {Object.keys(meta.injuryZones).map((z) => (
                    <button
                      type="button"
                      key={z}
                      className={`chip-toggle${v.injuries.includes(z) ? ' on' : ''}`}
                      aria-pressed={v.injuries.includes(z)}
                      onClick={() => toggleZone(z)}
                    >
                      {zone(z)}
                    </button>
                  ))}
                </div>
                <span className="field-hint">{t('profile.injuriesHint')}</span>
              </div>
            </>
          )}
          <p className="small muted">{t('profile.disclaimer')}</p>
        </fieldset>

        <ErrorText error={error} />
        <button className="btn" disabled={busy}>
          {t('profile.save')}
        </button>
      </form>
    </div>
  );
}

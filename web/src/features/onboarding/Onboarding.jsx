import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Button, FormError, IconButton, Mascot, Segments, Sheet, useToast } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { STEPS, clearAnswers, firstIncomplete, isValid, loadAnswers, payloadOf, saveAnswers, stepById, stepError, visibleSteps } from './flow';
import {
  ActivityStep,
  BirthStep,
  ConsentStep,
  DaysStep,
  DietStep,
  GoalStep,
  GoalWeightStep,
  HeightStep,
  LevelStep,
  PainsStep,
  SexStep,
  WeightStep,
  healthyState,
} from './steps';
import { ResultsStep, SummaryStep, TimelineStep } from './results';
import './onboarding.css';

const VIEWS = {
  goal: GoalStep,
  sex: SexStep,
  birthYear: BirthStep,
  height: HeightStep,
  weight: WeightStep,
  goalWeight: GoalWeightStep,
  activity: ActivityStep,
  level: LevelStep,
  pains: PainsStep,
  days: DaysStep,
  diet: DietStep,
  consent: ConsentStep,
  results: ResultsStep,
  timeline: TimelineStep,
  summary: SummaryStep,
};

// préfixe des textes (question + pourquoi) de chaque étape
const TEXT = {
  goal: 'onb.goal',
  sex: 'onb.sex',
  birthYear: 'onb.birth',
  height: 'onb.height',
  weight: 'onb.weight',
  goalWeight: 'onb.target',
  activity: 'onb.activity',
  level: 'onb.level',
  pains: 'onb.pains',
  days: 'onb.days',
  diet: 'onb.diet',
  consent: 'onb.consent',
};

/** Encouragement de la mascotte quand une réponse est choisie */
function praiseFor(id, a) {
  if (id === 'goalWeight') return healthyState(a).inside ? 'onb.target.praise' : null;
  if (id === 'pains') return (a.injuries || []).length ? 'onb.pains.praiseSome' : 'onb.pains.praiseNone';
  if (id === 'consent') return null;
  return `${TEXT[id]}.praise`;
}

/** B1a — Profil : une question par écran, 4 parties, puis résultats, courbe et récapitulatif */
export default function Onboarding() {
  const { user, refresh, logout } = useAuth();
  if (user?.onboardedAt) return <Navigate to="/app" replace />;
  return <Flow user={user} refresh={refresh} logout={logout} />;
}

function Flow({ user, refresh, logout }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [a, setAnswers] = useState(() => loadAnswers(user));
  const [touched, setTouched] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const main = useRef(null);

  const steps = visibleSteps(a);
  const requested = params.get('step');
  const missing = firstIncomplete(a);
  const fallback = missing ? missing.id : 'results';
  const reqIndex = steps.findIndex((s) => s.id === requested);
  const limit = missing ? steps.findIndex((s) => s.id === missing.id) : steps.length - 1;
  const stepId = reqIndex >= 0 && reqIndex <= limit ? requested : null;

  useEffect(() => {
    saveAnswers(user, a);
  }, [user, a]);

  // nouvelle étape : haut de page, focus sur la question
  useEffect(() => {
    setTouched(false);
    setSaveError(null);
    window.scrollTo(0, 0);
    main.current?.querySelector('h1')?.focus({ preventScroll: true });
  }, [stepId]);

  const set = useCallback((patch, { silent = false } = {}) => {
    setAnswers((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    if (!silent) setTouched(true);
  }, []);

  const go = useCallback(
    (id, { replace = false, returnTo } = {}) => {
      navigate({ pathname: '/onboarding', search: `?step=${id}` }, { replace, state: { onb: true, returnTo } });
    },
    [navigate]
  );

  if (!stepId) return <Navigate to={{ pathname: '/onboarding', search: `?step=${fallback}` }} replace state={location.state} />;

  const step = stepById(stepId);
  const index = steps.findIndex((s) => s.id === stepId);
  const valid = isValid(stepId, a);
  const error = stepError(stepId, a);
  const returnTo = location.state?.returnTo;
  const View = VIEWS[stepId];

  const next = () => {
    if (!valid) return;
    if (returnTo) {
      const gap = firstIncomplete(a);
      if (gap) go(gap.id, { returnTo });
      else go(returnTo);
      return;
    }
    const target = steps[index + 1];
    if (!target) return;
    if (!step.final && !target.final && target.section > step.section) {
      toast({ text: t('onb.toast', { done: t(`onb.section.${step.section}`), next: t(`onb.section.${target.section}`) }), tone: 'dark' });
    }
    go(target.id);
  };

  const back = () => {
    if (location.state?.onb) navigate(-1);
    else if (index > 0) go(steps[index - 1].id, { replace: true });
  };

  const create = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await api.put('/me/onboarding', payloadOf(a));
      clearAnswers();
      await refresh();
      toast({ text: t('onb.summary.done'), icon: 'circle-check' });
      navigate('/app', { replace: true });
    } catch (err) {
      setSaveError(err);
      setSaving(false);
    }
  };

  const quit = () => {
    clearAnswers();
    setQuitOpen(false);
    navigate('/connexion', { replace: true, state: { loggedOut: true } });
    logout().catch(() => {});
  };

  // barre de progression : parties terminées pleines, partie en cours au prorata
  let segments = null;
  if (!step.final) {
    const inSection = steps.filter((s) => s.section === step.section);
    const pos = inSection.findIndex((s) => s.id === stepId);
    segments = [0, 1, 2, 3].map((sec) => (sec < step.section ? 1 : sec > step.section ? 0 : (pos + (valid ? 1 : 0.5)) / inSection.length));
  }

  const first = index === 0 && !location.state?.onb;
  const praise = !step.final && touched && valid ? praiseFor(stepId, a) : null;

  let primary = { label: t('action.continue'), onClick: next, disabled: !valid };
  if (stepId === 'consent') primary.label = t('onb.consent.submit');
  if (stepId === 'results') primary.label = t('onb.results.seeCurve');
  if (stepId === 'summary') primary = { label: t('onb.summary.create'), onClick: create, disabled: false, loading: saving };

  return (
    <main className={`auth onb onb-${stepId}`} ref={main}>
      <div className="onb-top">
        {first ? (
          <IconButton icon="x" label={t('onb.quit')} onClick={() => setQuitOpen(true)} />
        ) : (
          <IconButton icon="arrow-left" label={t('action.back')} onClick={back} />
        )}
        {segments ? (
          <div className="grow">
            <Segments values={segments} label={t('onb.progress', { n: step.section + 1 })} />
          </div>
        ) : null}
      </div>

      {!step.final ? (
        <div className="stack-2 onb-head">
          <span className="onb-eyebrow">{t('onb.eyebrow', { section: t(`onb.section.${step.section}`), n: step.section + 1 })}</span>
          <h1 className="onb-title" tabIndex={-1}>
            {t(`${TEXT[stepId]}.q`)}
          </h1>
          <p className="muted onb-why">{t(`${TEXT[stepId]}.why`)}</p>
        </div>
      ) : null}

      <div className="onb-body">
        <View
          a={a}
          set={set}
          error={error}
          jump={(id) => go(id, { returnTo: stepId })}
          review={() => go(STEPS[0].id)}
        />
      </div>

      <div className="sticky-bar onb-bar">
        {praise ? <Mascot text={t(praise)} /> : null}
        {stepId === 'summary' ? <FormError error={saveError} /> : null}
        <Button variant="primary" size="lg" block disabled={primary.disabled} loading={primary.loading} onClick={primary.onClick}>
          {primary.label}
        </Button>
      </div>

      <Sheet
        open={quitOpen}
        onClose={() => setQuitOpen(false)}
        title={t('onb.quit.title')}
        footer={
          <>
            <Button variant="danger" block onClick={quit} icon="log-out">
              {t('onb.quit.confirm')}
            </Button>
            <Button variant="secondary" block onClick={() => setQuitOpen(false)}>
              {t('onb.quit.stay')}
            </Button>
          </>
        }
      >
        <p className="muted">{t('onb.quit.text')}</p>
      </Sheet>
    </main>
  );
}

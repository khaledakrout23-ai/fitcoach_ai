import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Icon, Logo, Ring, StatusPill, Num } from '../../components';
import LangSwitch from '../../components/LangSwitch';
import { useI18n } from '../../lib/i18n';
import './auth.css';

const SLIDES = [1, 2, 3];

// Illustrations faites de composants (pas de photo, pas de données personnelles)
function PlanVisual() {
  const { t } = useI18n();
  const rows = [
    ['auth.illus.ex1', '4 × 8'],
    ['auth.illus.ex2', '3 × 10'],
    ['auth.illus.ex3', '3 × 12'],
  ];
  return (
    <div className="wl-inner stack">
      <div className="row between">
        <span className="w500">{t('auth.illus.today')}</span>
        <StatusPill tone="ember" icon="sparkles">
          {t('auth.illus.aiPlan')}
        </StatusPill>
      </div>
      {rows.map(([key, sets]) => (
        <div key={key} className="row between small">
          <span className="ellipsis">{t(key)}</span>
          <Num className="muted">{sets}</Num>
        </div>
      ))}
      <span className="caption ok-text row-2">
        <Icon name="circle-check" size={16} />
        {t('auth.illus.adapted')}
      </span>
    </div>
  );
}

function BusyVisual() {
  const { t } = useI18n();
  return (
    <div className="wl-inner stack">
      <div className="row between">
        <span className="w500">{t('auth.illus.machine')}</span>
        <StatusPill tone="warn" icon="users">
          {t('auth.illus.busy')}
        </StatusPill>
      </div>
      {['auth.illus.alt1', 'auth.illus.alt2', 'auth.illus.alt3'].map((key) => (
        <div key={key} className="row between small">
          <span className="ellipsis">{t(key)}</span>
          <span className="ok-text row-2 w500">
            <span className="wl-led" aria-hidden="true" />
            {t('auth.illus.free')}
          </span>
        </div>
      ))}
    </div>
  );
}

function MealsVisual() {
  const { t } = useI18n();
  return (
    <div className="wl-inner stack-4">
      <div className="row wl-rings">
        <div className="stack-2 center-col">
          <Ring value={72} max={100} size={84} stroke={9}>
            <Icon name="flame" size={22} className="ember" />
          </Ring>
          <span className="caption muted">{t('auth.illus.kcal')}</span>
        </div>
        <div className="stack-2 center-col">
          <Ring value={60} max={100} size={84} stroke={9} color="var(--hydro)">
            <Icon name="droplet" size={22} className="hydro-text" />
          </Ring>
          <span className="caption muted">{t('auth.illus.water')}</span>
        </div>
      </div>
      <div className="row-2 wrap">
        <StatusPill icon="camera">{t('auth.illus.photo')}</StatusPill>
        <StatusPill tone="hydro" icon="glass-water">
          <span dir="ltr">{t('auth.illus.glass')}</span>
        </StatusPill>
      </div>
    </div>
  );
}

const VISUALS = { 1: PlanVisual, 2: BusyVisual, 3: MealsVisual };
const DECOR = { 1: 'sparkles', 2: 'dumbbell', 3: 'utensils' };

/** B1.2 — Bienvenue : carrousel de 3 diapositives, glissement tactile + points + clavier */
export default function Welcome() {
  const { t, dir } = useI18n();
  const track = useRef(null);
  const [index, setIndex] = useState(0);

  // position → diapositive affichée (scrollLeft est négatif en arabe)
  const onScroll = useCallback(() => {
    const el = track.current;
    if (!el || !el.clientWidth) return;
    const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    setIndex(Math.min(SLIDES.length - 1, Math.max(0, i)));
  }, []);

  const goTo = useCallback(
    (i, smooth = true) => {
      const el = track.current;
      if (!el) return;
      const n = Math.min(SLIDES.length - 1, Math.max(0, i));
      const left = n * el.clientWidth * (dir === 'rtl' ? -1 : 1);
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollTo({ left, behavior: smooth && !reduce ? 'smooth' : 'auto' });
      setIndex(n);
    },
    [dir]
  );

  // la langue change le sens : on garde la diapositive affichée
  useEffect(() => {
    goTo(index, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir]);

  const onKeyDown = (e) => {
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward) {
      e.preventDefault();
      goTo(index + 1);
    } else if (e.key === backward) {
      e.preventDefault();
      goTo(index - 1);
    }
  };

  return (
    <main className="auth welcome">
      <div className="auth-top">
        <Logo size={40} />
        <LangSwitch />
      </div>

      <section className="wl-carousel" aria-roledescription="carousel" aria-label={t('auth.welcome.slides')}>
        <div className="wl-track" ref={track} onScroll={onScroll} onKeyDown={onKeyDown} tabIndex={0}>
          {SLIDES.map((n, i) => {
            const Visual = VISUALS[n];
            return (
              <div
                key={n}
                className="wl-slide"
                role="group"
                aria-roledescription="slide"
                aria-label={t('auth.welcome.slide', { n })}
                aria-hidden={i !== index || undefined}
              >
                <div className="wl-visual">
                  <Icon name={DECOR[n]} size={120} stroke={1} className="wl-decor" />
                  <Visual />
                </div>
                <h1 className="wl-title">{t(`auth.welcome.s${n}.title`)}</h1>
                <p className="lead">{t(`auth.welcome.s${n}.text`)}</p>
              </div>
            );
          })}
        </div>
        <div className="wl-dots">
          {SLIDES.map((n, i) => (
            <button
              key={n}
              type="button"
              className={i === index ? 'on' : ''}
              aria-label={t('auth.welcome.slide', { n })}
              aria-current={i === index || undefined}
              onClick={() => goTo(i)}
            >
              <span />
            </button>
          ))}
        </div>
      </section>

      <div className="auth-foot">
        <Button variant="primary" size="lg" block to="/connexion?premiere=1">
          {t('auth.welcome.start')}
        </Button>
        <Button variant="text" block to="/connexion" className="wl-have">
          {t('auth.welcome.haveAccount')}
        </Button>
        <Link to="/salle/connexion" className="wl-staff caption">
          <Icon name="building-2" size={14} />
          {t('auth.welcome.staff')}
        </Link>
      </div>
    </main>
  );
}

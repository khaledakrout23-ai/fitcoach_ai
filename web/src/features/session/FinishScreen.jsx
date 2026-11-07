// Fin de séance : durée, volume, séries, kcal, records (confettis), partage, note 1–5
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Confetti, Icon, Num, useToast } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';

export default function FinishScreen({ session, stats, celebrate }) {
  const { t, tp, fmt, name, error: errText } = useI18n();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rating, setRating] = useState(session.rating || 0);
  const [saving, setSaving] = useState(false);
  const label = name(session, 'dayLabel') || t('session.title');

  async function rate(n) {
    const before = rating;
    setRating(n);
    setSaving(true);
    try {
      await api.put(`/sessions/${session.id}/rating`, { rating: n });
      toast({ text: t('session.finish.rated'), icon: 'star' });
    } catch (err) {
      setRating(before);
      toast({ text: errText(err), tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function share() {
    const lines = [
      t('session.finish.shareText', {
        label,
        duration: fmt.duration(stats.durationMin),
        volume: fmt.kg(stats.volumeKg),
        sets: tp('session.finish.setsN', stats.sets),
      }),
      ...stats.records.map((r) => t('session.finish.shareRecord', { name: name(r), kg: fmt.kg(r.weight) })),
    ];
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast({ text: t('action.copied'), icon: 'copy' });
    } catch {
      toast({ text: t('session.finish.shareFail'), tone: 'error' });
    }
  }

  return (
    <div className="page finish">
      {celebrate && stats.records.length ? <Confetti /> : null}
      <div className="finish-hero">
        <span className="finish-badge" aria-hidden="true">
          <Icon name={stats.records.length ? 'trophy' : 'check'} size={36} stroke={2.25} />
        </span>
        <h1 className="h1">{t('session.finish.title')}</h1>
        <p className="muted">
          {label} · {fmt.date(session.startedAt)}
        </p>
      </div>

      <div className="grid-2 finish-stats">
        <div className="card">
          <span className="caption muted">{t('session.finish.duration')}</span>
          <span className="big-num sm">
            <Num>{fmt.duration(stats.durationMin)}</Num>
          </span>
        </div>
        <div className="card">
          <span className="caption muted">{t('session.finish.volume')}</span>
          <span className="big-num sm">
            <Num>{fmt.num(stats.volumeKg)}</Num>
            <span className="num-unit">{t('unit.kg')}</span>
          </span>
        </div>
        <div className="card">
          <span className="caption muted">{t('session.finish.sets')}</span>
          <span className="big-num sm">
            <Num>{stats.sets}</Num>
          </span>
        </div>
        <div className="card">
          <span className="caption muted">{t('session.finish.kcal')}</span>
          <span className="big-num sm">
            <Num>{fmt.num(stats.kcal)}</Num>
            <span className="num-unit">{t('unit.kcal')}</span>
          </span>
        </div>
      </div>

      {stats.records.length ? (
        <section className="card ember stack-2" aria-labelledby="pr-title">
          <h2 id="pr-title" className="card-title row-2">
            <Icon name="trophy" className="ember" /> {tp('session.finish.records', stats.records.length)}
          </h2>
          {stats.records.map((r) => (
            <div key={r.exerciseId} className="row between">
              <span className="w500">{name(r)}</span>
              <span className="row-2">
                <span className="w600">
                  <Num>
                    {fmt.kg(r.weight)} × {r.reps}
                  </Num>
                </span>
                <span className="caption muted">
                  <Num>{t('session.finish.before', { kg: fmt.kg(r.previousBest) })}</Num>
                </span>
              </span>
            </div>
          ))}
        </section>
      ) : null}

      <section className="card stack-2 text-center" aria-labelledby="rate-title">
        <h2 id="rate-title" className="card-title">
          {t('session.finish.rate')}
        </h2>
        <div className="rate-stars" role="radiogroup" aria-label={t('session.finish.rate')}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t('session.finish.star', { n })}
              className={n <= rating ? 'on' : ''}
              disabled={saving}
              onClick={() => rate(n)}
            >
              <Icon name="star" size={32} fill={n <= rating} />
            </button>
          ))}
        </div>
      </section>

      <div className="sticky-bar">
        <Button variant="secondary" size="lg" block icon="share-2" onClick={share}>
          {t('session.finish.share')}
        </Button>
        <Button variant="primary" size="lg" block onClick={() => navigate('/app')}>
          {t('action.done')}
        </Button>
      </div>
    </div>
  );
}

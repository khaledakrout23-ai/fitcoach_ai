import { useParams } from 'react-router-dom';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { BarChart } from '../../components/Charts';
import { ErrorText, Spinner, useLoad } from '../../components/ui';

// Transforme un lien YouTube en lien « embed » pour l'afficher dans la page
export function youtubeEmbed(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

export function youtubeSearch(exercise) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.nameEn} exercise proper form`)}`;
}

export default function ExerciseSheet() {
  const { id } = useParams();
  const { t, name, list, muscle, zone, num, date } = useI18n();
  const ex = useLoad(() => api(`/exercises/${id}`), [id]);
  const history = useLoad(() => api(`/progress/exercise/${id}`), [id]);
  const video = useLoad(() => api(`/exercises/${id}/video`), [id]);

  if (ex.loading) return <Spinner />;
  if (!ex.data) return <ErrorText error={ex.error} />;
  const e = ex.data;
  const embed = video.data?.videoId ? `https://www.youtube-nocookie.com/embed/${video.data.videoId}` : youtubeEmbed(e.videoUrl);

  return (
    <div className="page page-narrow">
      <div>
        <h1>{name(e)}</h1>
        <div className="inline" style={{ marginTop: 8 }}>
          <span className="badge badge-brand">{muscle(e.primaryMuscle)}</span>
          {e.secondaryMuscles.map((m) => (
            <span key={m} className="badge">
              {muscle(m)}
            </span>
          ))}
          <span className="badge">{name(e.equipment)}</span>
          <span className="badge">{t('exercise.difficulty', { n: e.difficulty })}</span>
        </div>
      </div>

      <section className="panel stack">
        <h2>{t('exercise.video')}</h2>
        {video.loading && !embed ? (
          <Spinner />
        ) : embed ? (
          <div className="video">
            <iframe src={embed} title={name(e)} allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
          </div>
        ) : (
          <a className="btn btn-ghost" href={youtubeSearch(e)} target="_blank" rel="noreferrer">
            {t('exercise.searchVideo')}
          </a>
        )}
      </section>

      <div className="grid-2">
        <section className="panel">
          <h2 style={{ marginBottom: 10 }}>{t('exercise.benefits')}</h2>
          <ul className="rows">
            {list(e, 'benefits').map((b) => (
              <li key={b} className="row">
                <span style={{ color: 'var(--ok)', fontWeight: 700 }}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <h2 style={{ marginBottom: 10 }}>{t('exercise.mistakes')}</h2>
          <ul className="rows">
            {list(e, 'mistakes').map((b) => (
              <li key={b} className="row">
                <span style={{ color: 'var(--danger)', fontWeight: 700 }}>✕</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
          {e.injuryZones.length > 0 && (
            <p className="small muted" style={{ marginTop: 10 }}>
              {t('exercise.zones')} {e.injuryZones.map(zone).join(', ')}
            </p>
          )}
        </section>
      </div>

      {history.data && history.data.length > 0 && (
        <section className="panel">
          <h2 style={{ marginBottom: 10 }}>{t('exercise.myProgress')}</h2>
          <BarChart
            ariaLabel={t('exercise.myProgress')}
            data={history.data.map((p) => ({ label: date(p.date), value: p.maxWeight }))}
            highlight={history.data.length - 1}
            format={(v) => `${num(v)} kg`}
          />
        </section>
      )}
    </div>
  );
}

import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Banner, Button, Empty, ErrorState, Icon, IconButton, PageSkeleton } from '../../components';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';
import './report.css';

/**
 * Suivi d'un signalement : écran « Merci, c'est envoyé » juste après l'envoi, puis suivi Envoyé → Vu → En réparation → Réparé.
 * (Pas de GET /me/reports/:id dans l'API : le signalement est retrouvé dans la liste du membre.)
 */
export default function ReportDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t, tp, fmt, label } = useI18n();
  const fresh = Boolean(state?.fresh) && String(state?.report?.id) === String(id);
  const list = useLoad(() => (fresh ? null : api.get('/me/reports')), [id, fresh]);
  const meta = useLoad(() => api.get('/meta'), []);
  const report = fresh ? state.report : (list.data || []).find((r) => String(r.id) === String(id));

  const close = (
    <IconButton icon="x" label={t('action.close')} onClick={() => navigate(fresh ? '/app' : '/app/signalements')} />
  );

  if (!fresh && list.loading && !list.data) {
    return (
      <main className="page">
        <header className="app-header compact">{close}</header>
        <PageSkeleton cards={2} />
      </main>
    );
  }
  if (!fresh && list.error) {
    return (
      <main className="page">
        <header className="app-header compact">{close}</header>
        <ErrorState error={list.error} onRetry={list.reload} />
      </main>
    );
  }
  if (!report) {
    return (
      <main className="page">
        <header className="app-header compact">{close}</header>
        <Empty icon="wrench" title={t('err.NOT_FOUND')} action={<Button to="/app/signalements">{t('report.done.mine')}</Button>} />
      </main>
    );
  }

  const m = report.machine;
  const machineName = m ? m.label.charAt(0).toLowerCase() + m.label.slice(1) : '';
  const issue = label(meta.data?.issueTypes?.[report.issueType]);
  const nextIndex = report.timeline.findIndex((s) => !s.done);

  return (
    <main className="page rp-done">
      <header className="app-header compact">
        <span className="grow" />
        {close}
      </header>

      {fresh ? (
        <>
          <span className="rp-ok" aria-hidden="true">
            <Icon name="check" size={28} stroke={2.5} />
          </span>
          <h1 className="h1">{t('report.done.title')}</h1>
          <p className="muted">
            {t('report.done.text', { gym: user?.gym?.name || 'Kammel', machine: machineName, code: m?.code || '' })}
          </p>
          {report.otherOpenReports > 0 ? <p className="small muted">{tp('report.done.others', report.otherOpenReports)}</p> : null}
        </>
      ) : (
        <>
          <span className="caption muted">
            <span className="num">{t('report.detail.title', { ticket: report.ticket })}</span>
          </span>
          <h1 className="h2">{m ? `${m.label} #${m.code}` : report.ticket}</h1>
          <p className="small muted">{[issue, m?.zone, fmt.when(report.createdAt)].filter(Boolean).join(' · ')}</p>
          {report.description ? <p className="rp-desc">{report.description}</p> : null}
        </>
      )}

      {report.status === 'REJETE' ? (
        <Banner tone="warn" icon="circle-x">
          {t('report.detail.rejected')}
        </Banner>
      ) : null}

      <ol className="card rp-timeline">
        {report.timeline.map((s, i) => {
          const isNext = report.status !== 'REJETE' && i === nextIndex;
          let sub = null;
          if (s.done && s.at) sub = fmt.when(s.at);
          else if (isNext) sub = t('report.step.waiting');
          else if (s.step === 'REPAREE' && report.notify && !s.done) sub = t('report.step.notify');
          return (
            <li key={s.step} className={s.done ? 'rp-s-done' : isNext ? 'rp-s-next' : ''}>
              <span className="rp-dot" aria-hidden="true">
                {s.done ? <Icon name="check" size={14} stroke={3} /> : null}
              </span>
              <span className="grow">
                <span className={s.done || isNext ? 'w500' : 'muted'}>{t(`report.step.${s.step}`)}</span>
                {sub ? <span className="caption muted rp-block">{sub}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {!fresh && report.hasPhoto ? (
        <figure className="rp-figure">
          <img src={api.url(`/me/reports/${report.id}/photo`)} alt={t('report.photoAlt')} loading="lazy" />
          <figcaption className="caption muted">{t('report.photo')}</figcaption>
        </figure>
      ) : null}

      {fresh ? <p className="small muted">{t('report.done.note')}</p> : null}

      <div className="sticky-bar rp-actions">
        {fresh ? (
          <>
            <Button variant="primary" size="lg" block to="/app">
              {t('report.done.finish')}
            </Button>
            <Button variant="text" block to="/app/signalements">
              {t('report.done.mine')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="lg" block to="/app/signalements">
            {t('report.done.mine')}
          </Button>
        )}
      </div>
    </main>
  );
}

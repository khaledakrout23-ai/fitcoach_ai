import { useNavigate } from 'react-router-dom';
import { Button, Empty, ErrorState, Icon, IconButton, PageSkeleton, useToast } from '../../components';
import { api } from '../../lib/api';
import { useI18n } from '../../lib/i18n';
import { useLoad } from '../../lib/hooks';
import { safeInternalPath } from '../../lib/safePath';
import './home.css';

const KIND_ICONS = { EXPIRY: 'clock', CALM: 'users', REPAIRED: 'wrench', REPORT: 'wrench', SESSION: 'dumbbell', WATER: 'droplet', MESSAGE: 'bell', WELCOME: 'sparkles' };

/** Notifications du membre : liste, marquer comme lu, liens internes seulement */
export default function Notifications() {
  const { t, fmt, error: errText } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload, setData } = useLoad(() => api.get('/me/notifications'), []);

  const markRead = async (ids) => {
    const now = new Date().toISOString();
    setData((d) => (d ? { ...d, items: d.items.map((n) => (!ids || ids.includes(n.id) ? { ...n, readAt: n.readAt || now } : n)) } : d));
    try {
      const res = await api.post('/me/notifications/read', ids ? { ids } : { all: true });
      setData((d) => (d ? { ...d, unread: res.unread } : d));
      if (!ids) toast({ text: t('home.notif.allRead'), icon: 'check' });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
      reload();
    }
  };

  const open = (n) => {
    if (!n.readAt) markRead([n.id]);
    const to = safeInternalPath(n.link, null);
    if (to && to !== '/app/notifications') navigate(to);
  };

  const items = data?.items || [];
  const unread = items.some((n) => !n.readAt);

  return (
    <main className="page">
      <header className="app-header compact">
        <IconButton icon="arrow-left" label={t('action.back')} to="/app" />
        <h1>{t('home.notif.title')}</h1>
      </header>
      {loading && !data ? (
        <PageSkeleton cards={4} />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !items.length ? (
        <Empty icon="bell" title={t('home.notif.empty')}>
          {t('home.notif.emptyText')}
        </Empty>
      ) : (
        <>
          {unread ? (
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button variant="text" size="sm" icon="check" onClick={() => markRead(null)}>
                {t('home.notif.readAll')}
              </Button>
            </div>
          ) : null}
          <ul className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((n) => (
              <li key={n.id}>
                <button type="button" className={`nt-item ${n.readAt ? '' : 'nt-unread'}`} onClick={() => open(n)}>
                  <span className="nt-icon" aria-hidden="true">
                    <Icon name={KIND_ICONS[n.kind] || 'bell'} size={20} />
                  </span>
                  <span className="grow stack-2">
                    <span className={n.readAt ? '' : 'w600'}>{n.title}</span>
                    {n.body ? <span className="small muted nt-body">{n.body}</span> : null}
                    <span className="caption faint">{fmt.when(n.createdAt)}</span>
                  </span>
                  {!n.readAt ? <span className="nt-dot" role="img" aria-label={t('home.notif.unread')} /> : null}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

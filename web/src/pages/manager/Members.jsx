import { useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { Empty, ErrorText, Field, Modal, Spinner, SubscriptionBadge, useLoad, useToast } from '../../components/ui';

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function todayStr() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function SubscriptionForm({ member, onClose, onSaved }) {
  const { t } = useI18n();
  const start = todayStr();
  const [v, setV] = useState({ startDate: start, endDate: addDays(start, 30), amount: 60, paymentMethod: 'ESPECES', note: '' });
  const [error, setError] = useState(null);
  const set = (k) => (e) => setV({ ...v, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    try {
      await api('/manager/subscriptions', { method: 'POST', body: { ...v, amount: Number(v.amount), userId: member.id } });
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <Modal title={t('members.newSub', { name: member.name })} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <div className="form-grid">
          <Field label={t('members.start')}>
            <input type="date" value={v.startDate} onChange={(e) => setV({ ...v, startDate: e.target.value, endDate: addDays(e.target.value, 30) })} required />
          </Field>
          <Field label={t('members.end')}>
            <input type="date" value={v.endDate} onChange={set('endDate')} required />
          </Field>
          <Field label={t('members.amount')}>
            <input type="number" min="0" step="0.5" value={v.amount} onChange={set('amount')} required />
          </Field>
          <Field label={t('members.payment')}>
            <select value={v.paymentMethod} onChange={set('paymentMethod')}>
              {['ESPECES', 'CARTE', 'VIREMENT'].map((p) => (
                <option key={p} value={p}>
                  {t(`payment.${p}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('members.note')}>
            <input className="full" value={v.note} onChange={set('note')} />
          </Field>
        </div>
        <ErrorText error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn">{t('members.saveSub')}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Members() {
  const { t, date } = useI18n();
  const members = useLoad(() => api('/manager/members'));
  const [selected, setSelected] = useState(null);
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState('');
  const [error, setError] = useState(null);
  const [toast, showToast] = useToast();

  async function attach(e) {
    e.preventDefault();
    setError(null);
    try {
      await api('/manager/members', { method: 'POST', body: { email } });
      setEmail('');
      members.reload();
      showToast(t('members.added'));
    } catch (err) {
      setError(err);
    }
  }

  if (members.loading) return <Spinner />;
  const list = (members.data || []).filter((m) => `${m.name} ${m.email}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="page">
      {toast}
      <div className="page-head">
        <div>
          <h1>{t('nav.members')}</h1>
          <p className="page-sub">{t('members.sub', { n: members.data?.length || 0 })}</p>
        </div>
        <input style={{ maxWidth: 260 }} placeholder={t('common.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('common.search')} />
      </div>

      {list.length === 0 ? (
        <Empty title={t('members.empty')} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('auth.name')}</th>
                <th>{t('auth.email')}</th>
                <th>{t('members.status')}</th>
                <th>{t('members.end')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{m.name}</strong>
                    {m.goal && <div className="small muted">{t(`goal.${m.goal}`)}</div>}
                  </td>
                  <td>{m.email}</td>
                  <td>
                    <SubscriptionBadge sub={m.subscription} />
                  </td>
                  <td>{m.subscription ? date(m.subscription.endDate, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
                  <td style={{ textAlign: 'end' }}>
                    <button className="btn btn-small" onClick={() => setSelected(m)}>
                      {m.subscription ? t('members.renew') : t('members.subscribe')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form className="panel stack" onSubmit={attach}>
        <h2>{t('members.attachTitle')}</h2>
        <p className="small muted">{t('members.attachText')}</p>
        <div className="inline">
          <input type="email" style={{ flex: 1, minWidth: 220 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nom@exemple.tn" required aria-label={t('auth.email')} />
          <button className="btn">{t('members.attach')}</button>
        </div>
        <ErrorText error={error} />
      </form>

      {selected && (
        <SubscriptionForm
          member={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            members.reload();
            showToast(t('members.subSaved'));
          }}
        />
      )}
    </div>
  );
}

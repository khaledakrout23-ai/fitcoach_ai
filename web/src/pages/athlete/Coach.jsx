import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { useI18n } from '../../i18n';
import { ErrorText, Spinner, useLoad } from '../../components/ui';

export default function Coach() {
  const { t } = useI18n();
  const chat = useLoad(() => api('/coach/messages'));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const listRef = useRef(null);

  const messages = chat.data?.messages || [];

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length, busy]);

  async function send(content) {
    const value = (content ?? text).trim();
    if (!value) return;
    setBusy(true);
    setError(null);
    setText('');
    // le message apparaît tout de suite, la réponse arrive ensuite
    const base = { aiEnabled: chat.data?.aiEnabled };
    chat.setData({ ...base, messages: [...messages, { id: `tmp-${Date.now()}`, role: 'user', content: value }] });
    try {
      const { question, answer } = await api('/coach/messages', { method: 'POST', body: { content: value } });
      chat.setData({ ...base, messages: [...messages, question, answer] });
    } catch (err) {
      setError(err);
      chat.setData({ ...base, messages });
      setText(value);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    await api('/coach/messages', { method: 'DELETE' });
    chat.reload();
  }

  if (chat.loading && !chat.data) return <Spinner />;

  const suggestions = [t('coach.s1'), t('coach.s2'), t('coach.s3')];

  return (
    <div className="page page-narrow">
      <div className="page-head">
        <div>
          <h1>{t('nav.coach')}</h1>
          <p className="page-sub">{chat.data?.aiEnabled ? t('coach.aiOn') : t('coach.aiOff')}</p>
        </div>
        {messages.length > 0 && (
          <button className="btn btn-ghost btn-small" onClick={clear}>
            {t('coach.clear')}
          </button>
        )}
      </div>

      <div className="chat">
        <div className="chat-list" ref={listRef} aria-live="polite">
          {messages.length === 0 && (
            <div className="stack">
              <p className="muted">{t('coach.empty')}</p>
              <div className="chips">
                {suggestions.map((s) => (
                  <button key={s} className="chip-toggle" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {busy && <div className="bubble assistant muted">{t('coach.typing')}</div>}
        </div>
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('coach.placeholder')} aria-label={t('coach.placeholder')} />
          <button className="btn" disabled={busy || !text.trim()}>
            {t('coach.send')}
          </button>
        </form>
      </div>
      <ErrorText error={error} />
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Banner, Button, Empty, ErrorState, Icon, IconButton, OfflineBanner, Sheet, Skeleton, useToast } from '../../components';
import { api } from '../../lib/api';
import { useLoad, useOnline } from '../../lib/hooks';
import { useI18n } from '../../lib/i18n';
import './coach.css';

const SpeechRecognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const SPEECH_LANG = { fr: 'fr-FR', ar: 'ar-TN', en: 'en-GB' };
const QUICK = ['swap', 'meal', 'shoulder'];

const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** B8 — Coach Kammel : discussion, propositions (remplacement, douleur), saisie vocale */
export default function Coach() {
  const { t, error: errText } = useI18n();
  const { toast } = useToast();
  const online = useOnline();
  const chat = useLoad(() => api.get('/coach/messages'), []);
  const [pending, setPending] = useState(null); // message du membre en cours d'envoi
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const messages = chat.data?.messages || [];
  const needMeta = messages.some((m) => m.proposal?.type === 'ADD_PAIN');
  const meta = useLoad(() => (needMeta ? api.get('/meta') : null), [needMeta]);

  useLayoutEffect(() => {
    // le bas de la discussion (la barre de saisie est collée en bas de l'écran)
    window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages.length, pending]);

  const coachError = (err) => {
    const key = `coach.err.${err.code}`;
    return t(key) !== key ? t(key) : errText(err);
  };

  const send = async (text) => {
    const content = text.trim().slice(0, 1000);
    if (!content || pending) return false;
    setPending({ id: 'pending', role: 'user', content, createdAt: new Date().toISOString() });
    try {
      const res = await api.post('/coach/messages', { content });
      chat.setData((d) => ({ ...d, messages: [...(d?.messages || []), res.question, ...res.answers] }));
      setPending(null);
      return true;
    } catch (err) {
      setPending(null);
      toast({ text: `${t('coach.failed')} ${coachError(err)}`, tone: 'error' });
      return false;
    }
  };

  const answer = async (message, action) => {
    try {
      const res = await api.post(`/coach/messages/${message.id}/proposal`, { action });
      chat.setData((d) => ({ ...d, messages: d.messages.map((m) => (m.id === message.id ? res.message : m)) }));
      if (action === 'APPLY' && message.proposal.type === 'SWAP') toast({ text: t('coach.swap.applied'), icon: 'check' });
    } catch (err) {
      toast({ text: coachError(err), tone: 'error' });
      if (err.code === 'PROPOSAL_CLOSED' || err.code === 'PROPOSAL_OUTDATED') chat.reload();
    }
  };

  const clear = async () => {
    try {
      await api.del('/coach/messages');
      chat.setData((d) => ({ ...d, messages: [] }));
      toast({ text: t('coach.cleared'), icon: 'check' });
    } catch (err) {
      toast({ text: errText(err), tone: 'error' });
    }
    setConfirm(false);
  };

  const header = (
    <header className="app-header co-head">
      <span className="avatar co-avatar" aria-hidden="true">
        <img src="/brand/kammel-symbol.png" alt="" />
      </span>
      <div className="grow">
        <h1 className="h3">{t('coach.title')}</h1>
        <p className="small muted">{t('coach.sub')}</p>
      </div>
      {chat.data ? <IconButton icon="ellipsis" label={t('coach.menu')} onClick={() => setMenu(true)} disabled={!messages.length} /> : null}
    </header>
  );

  if (chat.error && chat.error.code === 'COACH_DISABLED') {
    return (
      <main className="page">
        {header}
        <Empty icon="message-circle" title={t('coach.disabled.title')}>
          {t('coach.disabled.text')}
        </Empty>
      </main>
    );
  }

  const last = messages[messages.length - 1];
  const awaitingPain = last && last.proposal?.type === 'ADD_PAIN' && last.proposalState === 'PENDING';
  const shown = pending ? [...messages, pending] : messages;

  return (
    <main className="page co">
      {header}
      <OfflineBanner text={t('coach.offline')} />
      {chat.data && chat.data.aiEnabled === false ? <Banner icon="info">{t('coach.simple')}</Banner> : null}

      {!chat.data && chat.error ? (
        <ErrorState error={chat.error} onRetry={chat.reload} />
      ) : !chat.data ? (
        <div className="stack" role="status" aria-label={t('state.loading')}>
          <Skeleton w="70%" h={64} className="co-sk-me" />
          <Skeleton w="80%" h={88} />
          <Skeleton w="85%" h={120} />
        </div>
      ) : (
        <div className="co-thread" aria-live="polite">
          {shown.length === 0 ? (
            <Empty icon="message-circle" title={t('coach.empty.title')}>
              {t('coach.empty.text')}
            </Empty>
          ) : null}
          {shown.map((m, i) => (
            <Message
              key={m.id}
              message={m}
              previous={shown[i - 1]}
              zones={meta.data?.injuryZones}
              online={online}
              onAnswer={answer}
            />
          ))}
          {pending ? (
            <div className="co-bubble co-typing" role="status" aria-label={t('coach.typing')}>
              <span />
              <span />
              <span />
            </div>
          ) : null}
        </div>
      )}

      <div className="co-dock">
        {chat.data && !pending && !awaitingPain ? (
          <div className="chips scroll co-quick" role="group" aria-label={t('coach.quickLabel')}>
            {QUICK.map((k) => (
              <button key={k} type="button" className="chip" onClick={() => send(t(`coach.quick.${k}Msg`))} disabled={!online}>
                {t(`coach.quick.${k}`)}
              </button>
            ))}
          </div>
        ) : null}
        <Composer onSend={send} disabled={!online || !chat.data} busy={Boolean(pending)} />
        <p className="caption muted text-center">{t('coach.disclaimer')}</p>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={t('coach.menu')}>
        <div className="action-list">
          <button
            type="button"
            className="danger-text"
            onClick={() => {
              setMenu(false);
              setConfirm(true);
            }}
          >
            <Icon name="trash-2" />
            {t('coach.clear')}
          </button>
        </div>
      </Sheet>
      <Sheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t('coach.clearConfirmTitle')}
        footer={
          <>
            <Button variant="danger-solid" block icon="trash-2" onClick={clear}>
              {t('coach.clear')}
            </Button>
            <Button variant="ghost" block onClick={() => setConfirm(false)}>
              {t('action.cancel')}
            </Button>
          </>
        }
      >
        <p className="muted">{t('coach.clearConfirmText')}</p>
      </Sheet>
    </main>
  );
}

/** Séparateur de date + bulle + proposition éventuelle */
function Message({ message: m, previous, zones, online, onAnswer }) {
  const { t, fmt, lang } = useI18n();
  const [busy, setBusy] = useState(null);
  const at = new Date(m.createdAt);
  const showDate = !previous || !sameDay(at, new Date(previous.createdAt)) || at - new Date(previous.createdAt) > 3 * 3600 * 1000;
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const dayLabel = sameDay(at, now) ? t('time.today') : sameDay(at, yesterday) ? t('time.yesterday') : fmt.date(at, { weekday: 'long', day: 'numeric', month: 'long' });
  const mine = m.role === 'user';
  const p = m.proposal;
  const pendingProposal = p && m.proposalState === 'PENDING';

  const act = async (action) => {
    setBusy(action);
    await onAnswer(m, action);
    setBusy(null);
  };
  const exName = (names) => (names ? names[lang] || names.fr || '' : '');
  const zone = p?.type === 'ADD_PAIN' ? (zones && zones[p.zone] ? zones[p.zone][lang] || zones[p.zone].fr : p.zone) : '';

  return (
    <>
      {showDate ? (
        <div className="co-date caption muted">
          {dayLabel} · <span className="num">{fmt.time(at)}</span>
        </div>
      ) : null}
      <div className={`co-bubble ${mine ? 'me' : ''}`}>
        <span className="sr-only">{mine ? t('coach.you') : t('coach.coachSays')} : </span>
        <p className="co-text" dir="auto">{m.content}</p>
      </div>

      {p?.type === 'SWAP' ? (
        <div className="co-bubble co-proposal">
          <p className="small muted">{t('coach.swap.title')}</p>
          <p className="small muted co-from">
            <span className="sr-only">{t('coach.swap.before')} </span>
            <s>{exName(p.fromName)}</s>
          </p>
          <p className="w600">
            <span className="sr-only">{t('coach.swap.after')} </span>
            {exName(p.toName)} ·{' '}
            <span className="num">
              {p.sets} × {p.reps}
            </span>
          </p>
          {pendingProposal ? (
            <div className="row-2 mt-2 wrap">
              <Button variant="primary" size="sm" onClick={() => act('APPLY')} loading={busy === 'APPLY'} disabled={!online || Boolean(busy)}>
                {t('coach.swap.apply')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => act('DISMISS')} loading={busy === 'DISMISS'} disabled={!online || Boolean(busy)}>
                {t('coach.swap.keep')}
              </Button>
            </div>
          ) : (
            <p className={`caption mt-2 row-2 ${m.proposalState === 'APPLIED' ? 'ok-text' : 'muted'}`}>
              <Icon name={m.proposalState === 'APPLIED' ? 'circle-check' : 'circle-off'} size={16} />
              <span>{m.proposalState === 'APPLIED' ? t('coach.swap.applied') : t('coach.swap.dismissed')}</span>
            </p>
          )}
        </div>
      ) : null}

      {p?.type === 'ADD_PAIN' ? (
        pendingProposal ? (
          <div className="chips co-answers">
            <button type="button" className="chip co-answer" onClick={() => act('APPLY')} disabled={!online || Boolean(busy)}>
              {t('coach.pain.yes')}
            </button>
            <button type="button" className="chip co-answer" onClick={() => act('DISMISS')} disabled={!online || Boolean(busy)}>
              {t('coach.pain.no')}
            </button>
          </div>
        ) : (
          <p className={`caption co-state ${m.proposalState === 'APPLIED' ? 'ok-text' : 'muted'}`}>
            {m.proposalState === 'APPLIED' ? t('coach.pain.added', { zone }) : t('coach.pain.dismissed')}
          </p>
        )
      ) : null}
    </>
  );
}

/** Zone de saisie : texte, dictée (si le navigateur la propose), envoi */
function Composer({ onSend, disabled, busy }) {
  const { t, lang } = useI18n();
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const inputRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [text]);
  useEffect(() => () => recRef.current?.abort(), []);

  const submit = async (e) => {
    e?.preventDefault();
    if (!text.trim() || disabled || busy) return;
    const value = text;
    setText('');
    recRef.current?.stop();
    const ok = await onSend(value);
    if (!ok) setText(value);
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SpeechRecognition();
    rec.lang = SPEECH_LANG[lang] || 'fr-FR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (ev) => {
      const said = Array.from(ev.results)
        .map((r) => r[0].transcript)
        .join(' ')
        .trim();
      if (said) setText((cur) => `${cur ? `${cur} ` : ''}${said}`.slice(0, 1000));
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  return (
    <form className="co-composer" onSubmit={submit}>
      <div className="co-field">
        <textarea
          ref={inputRef}
          dir="auto"
          className="co-input"
          rows={1}
          value={text}
          maxLength={1000}
          placeholder={listening ? t('coach.listening') : t('coach.placeholder')}
          aria-label={t('coach.inputLabel')}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
        />
        {SpeechRecognition ? (
          <IconButton
            icon="mic"
            plain
            size={22}
            className={`co-mic ${listening ? 'on' : ''}`}
            label={listening ? t('coach.micStop') : t('coach.mic')}
            aria-pressed={listening}
            onClick={toggleMic}
            disabled={disabled}
          />
        ) : null}
      </div>
      <button type="submit" className="co-send" aria-label={t('coach.send')} disabled={disabled || busy || !text.trim()}>
        <Icon name="send" size={22} />
      </button>
    </form>
  );
}

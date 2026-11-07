// M3 — Scanner une entrée : caméra (BarcodeDetector ou jsQR chargé à la demande), lecteur USB / clavier, entrée manuelle
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Icon, IconButton, OfflineBanner, Sheet, useToast } from '../../../components';
import { api } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useI18n } from '../../../lib/i18n';
import { can } from '../../../lib/permissions';
import { MemberPicker, subStatusText } from './shared';
import './ops.css';

const RESULT = {
  GRANTED: { tone: 'ok', icon: 'circle-check', key: 'ops.scan.granted' },
  GRANTED_GRACE: { tone: 'warn', icon: 'triangle-alert', key: 'ops.scan.grace' },
  REFUSED: { tone: 'danger', icon: 'circle-x', key: 'ops.scan.refused' },
};

/** Lecture de QR dans un flux vidéo : BarcodeDetector natif sinon jsQR (chargé seulement si besoin) */
async function makeDetector() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      if (formats.includes('qr_code')) {
        const d = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => {
          const codes = await d.detect(video);
          return codes[0]?.rawValue || null;
        };
      }
    } catch {
      /* repli sur jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
    return code?.data || null;
  };
}

export default function Scanner() {
  const { t, fmt, name } = useI18n();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const video = useRef(null);
  const stream = useRef(null);
  const paused = useRef(false);
  const busy = useRef(false);
  const input = useRef(null);
  const [camera, setCamera] = useState('starting'); // starting | on | denied | unavailable
  const [torch, setTorch] = useState(null); // null = pas de lampe
  const [result, setResult] = useState(null);
  const [manual, setManual] = useState(false);
  const [typed, setTyped] = useState('');

  const send = useCallback(
    async (body) => {
      if (busy.current) return;
      busy.current = true;
      paused.current = true;
      try {
        const res = await api.post('/staff/checkins', body);
        setResult({ ...res, at: new Date() });
        if (navigator.vibrate) navigator.vibrate(res.result === 'REFUSED' ? [80, 60, 80] : 60);
      } catch (err) {
        paused.current = false;
        toast({ text: err.code === 'NETWORK' ? t('err.NETWORK') : t('ops.scan.failed'), tone: 'error' });
      } finally {
        busy.current = false;
      }
    },
    [t, toast]
  );

  // caméra arrière + boucle de détection
  useEffect(() => {
    let alive = true;
    let timer = null;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera('unavailable');
        return;
      }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!alive) {
          s.getTracks().forEach((tr) => tr.stop());
          return;
        }
        stream.current = s;
        const track = s.getVideoTracks()[0];
        const caps = track.getCapabilities ? track.getCapabilities() : {};
        if (caps.torch) setTorch(false);
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setCamera('on');
        const detect = await makeDetector();
        const tick = async () => {
          if (!alive) return;
          if (!paused.current && video.current && video.current.readyState >= 2) {
            try {
              const code = await detect(video.current);
              if (code && alive && !paused.current) send({ code: code.slice(0, 200) });
            } catch {
              /* image illisible : on continue */
            }
          }
          timer = setTimeout(tick, 250);
        };
        tick();
      } catch (err) {
        if (alive) setCamera(err && err.name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timer);
      stream.current?.getTracks().forEach((tr) => tr.stop());
      stream.current = null;
    };
  }, [send]);

  const toggleTorch = async () => {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch {
      setTorch(null);
    }
  };

  const next = () => {
    setResult(null);
    paused.current = false;
    setTyped('');
    input.current?.focus({ preventScroll: true });
  };

  // lecteur USB : il « tape » le code puis Entrée
  const onTyped = (e) => {
    e.preventDefault();
    const code = typed.trim();
    if (code) {
      setTyped('');
      send({ code: code.slice(0, 200) });
    }
  };

  const r = result ? RESULT[result.result] : null;
  const m = result?.member;

  return (
    <div className="ops-scanner" data-theme="dark">
      <OfflineBanner text={t('ops.offline')} />
      <div className="ops-scan-head">
        <IconButton icon="x" label={t('action.close')} onClick={() => navigate(-1)} />
        <h1 className="h3">{t('ops.scan.title')}</h1>
        {torch !== null ? <IconButton icon="flashlight" label={t('ops.scan.torch')} onClick={toggleTorch} aria-pressed={torch} /> : <span className="ops-scan-spacer" />}
      </div>

      <div className="ops-scan-view">
        <video ref={video} className={camera === 'on' ? '' : 'hidden'} muted playsInline aria-hidden="true" />
        <div className="ops-scan-frame" aria-hidden="true" />
        {camera !== 'on' ? (
          <div className="ops-scan-msg">
            <Icon name="camera" size={28} />
            <span>{camera === 'starting' ? t('ops.scan.starting') : camera === 'denied' ? t('ops.scan.denied') : t('ops.scan.noCamera')}</span>
          </div>
        ) : null}
      </div>
      <p className="ops-scan-hint">{t('ops.scan.hint')}</p>

      <form className="ops-scan-usb" onSubmit={onTyped}>
        <label className="sr-only" htmlFor="ops-usb">
          {t('ops.scan.usb')}
        </label>
        <div className="search ops-search-full">
          <Icon name="qr-code" size={20} />
          <input
            id="ops-usb"
            ref={input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={t('ops.scan.usb')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            dir="ltr"
            maxLength={200}
          />
        </div>
      </form>

      <div className={`ops-scan-sheet ${result ? 'open' : ''}`} aria-live="assertive">
        <div className="grabber" aria-hidden="true" />
        {result && r ? (
          <div className="stack-4">
            <div className="row-2">
              <span className={`ops-scan-icon ${r.tone}-text`}>
                <Icon name={r.icon} size={30} />
              </span>
              <div className="grow">
                <div className="h3">{t(r.key)}</div>
                <div className="small muted">
                  <span className="num">{fmt.time(result.at)}</span>
                  {result.reason && result.result === 'REFUSED' ? ` · ${t(`ops.reason.${result.reason}`)}` : ''}
                  {result.duplicate ? ` · ${t('ops.scan.duplicate')}` : ''}
                </div>
              </div>
            </div>
            {m ? (
              <div className="card flat row-2">
                <Avatar name={m.name} />
                <div className="grow min0">
                  <div className="w500 ellipsis" dir="auto">
                    {m.name}
                  </div>
                  <div className={`small ${m.status === 'ACTIF' ? 'muted' : m.status === 'EXPIRE_BIENTOT' || m.status === 'GRACE' ? 'warn-text' : 'danger-text'}`}>
                    {m.plan ? <span dir="auto">{name(m.plan)}</span> : null}
                    {m.plan ? ' · ' : ''}
                    {m.endDate && m.daysLeft != null && m.daysLeft >= 0
                      ? t('ops.scan.daysLeft', { n: m.daysLeft })
                      : m.endDate
                        ? t('ops.scan.endedOn', { date: fmt.shortDate(m.endDate) })
                        : subStatusText(t, m.status, m.daysLeft)}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="ops-sheet-actions">
              {m && can(user, 'members.write') ? (
                <Button variant="secondary" to={`/salle/membres/${m.id}${can(user, 'payments') ? '?renouveler=1' : ''}`}>
                  {t('ops.scan.renew')}
                </Button>
              ) : null}
              <Button variant="primary" className="grow" onClick={next} autoFocus>
                {t('ops.scan.next')}
              </Button>
            </div>
          </div>
        ) : (
          <p className="small muted text-center">{t('ops.scan.waiting')}</p>
        )}
        <button type="button" className="link-btn ops-scan-manual" onClick={() => setManual(true)}>
          <Icon name="search" size={18} /> {t('ops.scan.manual')}
        </button>
      </div>

      <Sheet open={manual} onClose={() => setManual(false)} title={t('ops.scan.manualTitle')} subtitle={t('ops.scan.manualSub')}>
        <MemberPicker
          autoFocus
          onPick={(mem) => {
            setManual(false);
            send({ memberId: mem.id });
          }}
        />
      </Sheet>
    </div>
  );
}

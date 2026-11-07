import { useEffect, useRef, useState } from 'react';
import { Banner, Sheet } from '../../components';
import { useI18n } from '../../lib/i18n';

const SCAN_EVERY_MS = 250;
const FRAME_WIDTH = 480;

/**
 * Lecture d'un QR avec la caméra arrière : BarcodeDetector si le navigateur l'a, sinon jsQR (chargé à la demande).
 * L'image ne quitte jamais le téléphone.
 */
export default function Scanner({ open, onClose, onResult, message }) {
  const { t } = useI18n();
  const videoRef = useRef(null);
  const [error, setError] = useState(null);
  const resultRef = useRef(onResult);
  resultRef.current = onResult;

  useEffect(() => {
    if (!open) return undefined;
    let stream = null;
    let timer = null;
    let stopped = false;
    setError(null);

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('unavailable');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (err) {
        setError(err && (err.name === 'NotAllowedError' || err.name === 'SecurityError') ? 'denied' : 'unavailable');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play().catch(() => {});

      let detect;
      if ('BarcodeDetector' in window) {
        try {
          const formats = await window.BarcodeDetector.getSupportedFormats();
          if (formats.includes('qr_code')) {
            const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
            detect = async () => (await detector.detect(video))[0]?.rawValue || null;
          }
        } catch {
          detect = null;
        }
      }
      if (!detect) {
        const { default: jsQR } = await import('jsqr');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        detect = async () => {
          if (!video.videoWidth) return null;
          const scale = Math.min(1, FRAME_WIDTH / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          return jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data || null;
        };
      }
      const tick = async () => {
        if (stopped) return;
        try {
          const text = await detect();
          if (text && !stopped) resultRef.current(text);
        } catch {
          /* image illisible : on réessaie */
        }
        if (!stopped) timer = setTimeout(tick, SCAN_EVERY_MS);
      };
      tick();
    };
    start();

    return () => {
      stopped = true;
      clearTimeout(timer);
      if (stream) stream.getTracks().forEach((tr) => tr.stop());
    };
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose} title={t('report.scan.title')} subtitle={t('report.scan.hint')} dark>
      <div className="stack">
        {error ? (
          <Banner tone="danger" icon="circle-alert">
            {t(error === 'denied' ? 'report.scan.denied' : 'report.scan.unavailable')}
          </Banner>
        ) : (
          <div className="rp-video">
            <video ref={videoRef} playsInline muted aria-label={t('report.scan.title')} />
            <span className="rp-frame" aria-hidden="true" />
          </div>
        )}
        {message ? (
          <Banner tone="warn" icon="triangle-alert">
            {message}
          </Banner>
        ) : null}
      </div>
    </Sheet>
  );
}

import { useEffect, useRef } from 'react';
import { shrinkPhoto } from '../photo';

// Bouton « Prendre une photo ».
// Dans l'application mobile (site affiché dans une WebView), l'appareil photo est ouvert par l'application :
// on lui envoie « takePhoto » et elle répond par l'événement « nativePhoto ». Sinon : champ fichier classique.
export default function PhotoButton({ label, onPhoto, onError, disabled, className = 'btn' }) {
  const native = typeof window !== 'undefined' && window.ReactNativeWebView;
  const handlers = useRef({ onPhoto, onError });
  handlers.current = { onPhoto, onError };

  useEffect(() => {
    if (!native) return undefined;
    const listen = (e) => {
      const { image, error } = e.detail || {};
      if (error) handlers.current.onError?.({ code: error });
      else if (image) handlers.current.onPhoto(image);
    };
    window.addEventListener('nativePhoto', listen);
    return () => window.removeEventListener('nativePhoto', listen);
  }, [native]);

  async function pick(e) {
    const file = e.target.files[0];
    e.target.value = ''; // permet de reprendre la même photo
    if (!file) return;
    try {
      onPhoto(await shrinkPhoto(file));
    } catch (err) {
      onError?.(err);
    }
  }

  if (native) {
    return (
      <button type="button" className={className} style={{ justifySelf: 'start' }} disabled={disabled} onClick={() => window.ReactNativeWebView.postMessage('takePhoto')}>
        📷 {label}
      </button>
    );
  }
  return (
    <label className={className} style={{ justifySelf: 'start', cursor: 'pointer' }}>
      📷 {label}
      <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={disabled} hidden />
    </label>
  );
}

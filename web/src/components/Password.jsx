import { useState } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { ErrorText, Field, Modal } from './ui';

// Mêmes règles que le serveur : 8 caractères, une majuscule, une minuscule, un chiffre
export const PASSWORD_RULES = [
  ['pw.length', (p) => p.length >= 8],
  ['pw.upper', (p) => /[A-Z]/.test(p)],
  ['pw.lower', (p) => /[a-z]/.test(p)],
  ['pw.digit', (p) => /\d/.test(p)],
];

export const passwordOk = (p) => PASSWORD_RULES.every(([, ok]) => ok(p));

// Liste des règles, cochées en direct pendant la saisie
export function PasswordChecklist({ value }) {
  const { t } = useI18n();
  return (
    <ul className="pw-rules" aria-live="polite">
      {PASSWORD_RULES.map(([key, ok]) => {
        const done = ok(value || '');
        return (
          <li key={key} className={done ? 'ok' : ''}>
            <span aria-hidden="true">{done ? '✓' : '○'}</span> {t(key)}
          </li>
        );
      })}
    </ul>
  );
}

// Champ « nouveau mot de passe » avec bouton afficher/masquer et règles
export function NewPasswordField({ label, value, onChange }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="pw-input">
        <input type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} required />
        <button type="button" className="btn btn-small btn-ghost" onClick={() => setShow(!show)} aria-label={show ? t('pw.hide') : t('pw.show')}>
          {show ? t('pw.hide') : t('pw.show')}
        </button>
      </div>
      <PasswordChecklist value={value} />
    </Field>
  );
}

// Fenêtre « Changer mon mot de passe » (tous les rôles)
export function ChangePasswordModal({ onClose, onDone }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError({ code: 'PASSWORD_MISMATCH' });
    setBusy(true);
    try {
      await api('/me/password', { method: 'PUT', body: { currentPassword: current, newPassword: next } });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
    return undefined;
  }

  return (
    <Modal title={t('pw.changeTitle')} onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <Field label={t('pw.current')}>
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </Field>
        <NewPasswordField label={t('pw.new')} value={next} onChange={setNext} />
        <Field label={t('pw.confirm')}>
          <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </Field>
        <ErrorText error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn" disabled={busy || !passwordOk(next)}>
            {t('pw.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

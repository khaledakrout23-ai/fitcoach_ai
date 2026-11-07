import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { PublicOnly } from '../../app/guards';
import { useAuth, homeFor } from '../../lib/auth';
import { useI18n } from '../../lib/i18n';
import { safeInternalPath } from '../../lib/safePath';
import { Icon } from '../../components';

/**
 * Page publique où l'on se connecte.
 * Un compte déjà connecté à l'ouverture va chez lui (PublicOnly). Une fois la page affichée,
 * c'est la page qui navigue après la connexion : sinon la redirection automatique perdrait
 * l'état passé à /premiere-connexion. Après « Se déconnecter » (state.loggedOut), on reste ici.
 */
export function Guest({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const shown = useRef(false);
  if (!loading && (!user || location.state?.loggedOut)) shown.current = true;
  if (shown.current) return children;
  return <PublicOnly>{children}</PublicOnly>;
}

/** Destination après connexion : page demandée avant la connexion si elle est dans l'espace du compte, sinon son accueil */
export function afterLogin(user, from) {
  const home = homeFor(user);
  if (user.mustChangePassword || home === '/onboarding') return home;
  const wanted = safeInternalPath(from, '');
  if (wanted && (wanted === home || wanted.startsWith(`${home}/`))) return wanted;
  return home;
}

/** Règles du mot de passe (politique du serveur) : 8 caractères, une lettre et un chiffre, différent du provisoire */
export function passwordChecks(password, confirm, temporary) {
  const p = password || '';
  const checks = [
    { key: 'length', ok: p.length >= 8 && p.length <= 128 },
    { key: 'mix', ok: /[A-Za-z؀-ۿ]/.test(p) && /\d/.test(p) },
  ];
  if (temporary !== undefined) checks.push({ key: 'diff', ok: Boolean(p) && Boolean(temporary) && p !== temporary });
  checks.push({ key: 'same', ok: Boolean(p) && p === confirm });
  return checks;
}

/** Liste des règles avec coches vertes, mise à jour à la frappe */
export function PasswordRules({ checks }) {
  const { t } = useI18n();
  return (
    <ul className="rules" aria-label={t('auth.rules')}>
      {checks.map((c) => (
        <li key={c.key} className={c.ok ? 'ok' : ''}>
          <span className="tick" aria-hidden="true">
            <Icon name="check" size={14} stroke={3} />
          </span>
          <span>
            {t(`auth.rule.${c.key}`)}
            <span className="sr-only"> · {t(c.ok ? 'auth.rule.done' : 'auth.rule.todo')}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Message d'un refus WEAK_PASSWORD : détail par règle quand le serveur le donne */
export function weakMessage(err, t, error) {
  if (err?.code === 'WEAK_PASSWORD' && Array.isArray(err.details) && err.details.length) {
    return err.details.map((d) => t(`auth.weak.${d}`)).join(' ');
  }
  return error(err);
}

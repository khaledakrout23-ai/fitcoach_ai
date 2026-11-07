// Redirections internes uniquement (paramètre ?next=, lien d'une notification) :
// refuse « //site.com », « /\site.com », « https://… », « javascript: » (redirections ouvertes).
export function safeInternalPath(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) return fallback;
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

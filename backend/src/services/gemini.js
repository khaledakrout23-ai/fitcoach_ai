// Appel de l'API Gemini (Google AI Studio, offre gratuite).
// Sans clé GEMINI_API_KEY, renvoie null : l'application passe alors en mode simple.

function hasAI() {
  return Boolean(process.env.GEMINI_API_KEY);
}

/**
 * @param {object} p
 * @param {string} p.system   consignes du coach
 * @param {{role: 'user'|'model', text: string, image?: {mimeType: string, data: string}}[]} p.messages  image en base64
 * @param {boolean} [p.json]  demander une réponse JSON
 * @returns {Promise<string|null>}
 */
async function generate({ system, messages, json = false }) {
  if (!hasAI()) return null;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const fallback = process.env.GEMINI_FALLBACK_MODEL || 'gemini-flash-lite-latest';
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role,
      parts: m.image ? [{ inlineData: { mimeType: m.image.mimeType, data: m.image.data } }, { text: m.text }] : [{ text: m.text }],
    })),
    generationConfig: json ? { responseMimeType: 'application/json', temperature: 0.4 } : { temperature: 0.7 },
  };
  const call = (m) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
  try {
    let res = await call(model);
    // modèle surchargé (503) ou quota gratuit épuisé (429) : on passe au modèle de secours
    if ((res.status === 503 || res.status === 429) && fallback !== model) {
      console.warn(`[Gemini] ${model} indisponible (${res.status}), essai avec ${fallback}`);
      res = await call(fallback);
    }
    if (!res.ok) {
      console.warn(`[Gemini] erreur ${res.status} : ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
    return text || null;
  } catch (err) {
    console.warn('[Gemini] indisponible :', err.message);
    return null;
  }
}

module.exports = { generate, hasAI };

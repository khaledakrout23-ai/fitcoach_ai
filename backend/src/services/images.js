// Photos envoyées par le site (« data:image/...;base64,... ») : type vérifié sur les octets eux-mêmes,
// pas seulement sur ce que déclare le navigateur. Seuls JPEG, PNG et WebP sont acceptés.
const { HttpError } = require('../middleware/errors');

const MAX_BYTES = 2 * 1024 * 1024; // le site réduit déjà les photos à 1024 px (≈ 150 Ko)

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * @param {string} dataUrl
 * @returns {{ mimeType: string, buffer: Buffer, base64: string }}
 * @throws {HttpError} 400 PHOTO_INVALID, 413 TOO_LARGE
 */
function parsePhoto(dataUrl) {
  const m = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'PHOTO_INVALID', 'Photo invalide.');
  const buffer = Buffer.from(m[1], 'base64');
  if (buffer.length > MAX_BYTES) throw new HttpError(413, 'TOO_LARGE', 'Photo trop volumineuse.');
  const mimeType = sniff(buffer);
  if (!mimeType) throw new HttpError(400, 'PHOTO_INVALID', 'Photo invalide.');
  return { mimeType, buffer, base64: m[1] };
}

// Envoie une photo stockée en base, sans permettre au navigateur d'en faire autre chose qu'une image
function sendPhoto(res, buffer, mimeType) {
  if (!buffer || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
    throw new HttpError(404, 'NOT_FOUND', 'Photo introuvable.');
  }
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.end(buffer);
}

module.exports = { parsePhoto, sendPhoto, MAX_BYTES };

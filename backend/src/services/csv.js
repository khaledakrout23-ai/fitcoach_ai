// Export CSV (ouvert dans Excel / LibreOffice). Protège contre l'injection de formules :
// une cellule qui commence par = + - @ (ou tabulation / retour chariot) est préfixée d'une apostrophe.
const SEPARATOR = ';'; // Excel en français attend « ; »

function csvCell(value) {
  if (value == null) return '';
  let s = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[";\n\r,]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * @param {object[]} rows
 * @param {{ key: string, label: string }[]} columns
 * @returns {string} contenu CSV avec BOM UTF-8 (accents et arabe lisibles dans Excel)
 */
function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.label)).join(SEPARATOR)];
  for (const row of rows) lines.push(columns.map((c) => csvCell(row[c.key])).join(SEPARATOR));
  return `﻿${lines.join('\r\n')}\r\n`;
}

function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`);
  res.send(toCsv(rows, columns));
}

module.exports = { csvCell, toCsv, sendCsv, SEPARATOR };

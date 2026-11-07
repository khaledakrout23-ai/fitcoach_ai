require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const { notFound, errorHandler } = require('./middleware/errors');
const { securityHeaders, trustedProxy, cors, csrfGuard, cookies, rateLimit } = require('./middleware/security');
const { hasAI } = require('./services/gemini');
const { sequelize } = require('./models');

const app = express();
app.disable('x-powered-by');
// derrière un proxy (Nginx, Render…) : TRUST_PROXY=1 pour lire la vraie adresse IP du client
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use(securityHeaders);
app.use('/api', trustedProxy);
app.use('/api', cors);
app.use('/api', cookies);

// Photos (repas, panne, machine) : 3 Mo maximum ; tout le reste : 100 Ko
const PHOTO_ROUTES = ['/api/nutrition/analyze', '/api/me/reports', '/api/staff/reports', '/api/staff/machines/identify', '/api/admin/machines/identify'];
app.use(PHOTO_ROUTES, express.json({ limit: '3mb' }));
app.use('/api', express.json({ limit: '100kb' }));
app.use('/api', csrfGuard);
// garde-fou global : 600 requêtes par minute et par adresse IP
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600 }));

// Santé : utilisée par Render et par le service de réveil (cron-job.org). Touche aussi la base pour la garder active.
app.get('/api/health', async (req, res) => {
  try {
    await sequelize.query('SELECT 1');
    res.json({ ok: true, db: true, ai: hasAI() });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api', require('./routes/catalog').router);
app.use('/api/programs', require('./routes/programs'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/coach', require('./routes/coach'));
app.use('/api/nutrition', require('./routes/nutrition'));
app.use('/api/staff', require('./routes/staff'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', notFound);

// Site web compilé (npm run build dans web/) servi par la même origine : cookies SameSite=Strict, pas de CORS
const WEB_DIST = path.resolve(__dirname, '../../web/dist');
if (process.env.SERVE_WEB !== 'false' && fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
  app.use(
    express.static(WEB_DIST, {
      index: false,
      setHeaders(res, file) {
        // fichiers avec empreinte dans le nom : cache long ; le reste (sw.js, manifest) : toujours revalidé
        if (/[\\/]assets[\\/]/.test(file)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.use(errorHandler);

module.exports = app;

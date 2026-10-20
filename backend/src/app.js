require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { notFound, errorHandler } = require('./middleware/errors');
const { hasAI } = require('./services/gemini');

const app = express();

app.use(cors());
app.use(express.json({ limit: '8mb' })); // photos de machines envoyées en base64

app.get('/api/health', (req, res) => res.json({ ok: true, ai: hasAI() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/me', require('./routes/me'));
app.use('/api', require('./routes/catalog').router);
app.use('/api/programs', require('./routes/programs'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/coach', require('./routes/coach'));
app.use('/api/nutrition', require('./routes/nutrition'));
app.use('/api/manager', require('./routes/manager'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', notFound);
app.use(errorHandler);

module.exports = app;

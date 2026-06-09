const express = require('express');
const path = require('path');
const { authMiddleware } = require('./middleware/auth');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => {
    if (p.endsWith('.js') || p.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Auth middleware for all /api routes (public paths handled internally)
app.use('/api', authMiddleware);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/lists'));
app.use('/api', require('./routes/movies'));
app.use('/api/tmdb', require('./routes/tmdb'));

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

module.exports = app;

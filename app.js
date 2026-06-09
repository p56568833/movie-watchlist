const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'mw-secret-change-in-production';
const app = express();
const errMsg = (err, fallback) =>
  process.env.NODE_ENV === 'production' ? fallback : (err.message || fallback);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, p) => {
    if (p.endsWith('.js') || p.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// ── JWT Auth middleware ───────────────────────────────

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register', '/api/tmdb'];

function authMiddleware(req, res, next) {
  // Skip public paths (mounted under /api, so req.path has /api stripped)
  if (req.path.startsWith('/auth/') || req.path.startsWith('/tmdb/') || req.originalUrl === '/health') {
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }

  try {
    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.id;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

app.use('/api', authMiddleware);

// ── Auth routes ───────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !username.trim()) return res.status(400).json({ error: '用户名不能为空' });
    if (!password || password.length < 3) return res.status(400).json({ error: '密码至少3位' });

    const existing = await db.getUserByUsername(username.trim());
    if (existing) return res.status(409).json({ error: '用户名已存在' });

    const user = await db.createUser(username.trim(), password);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '注册失败' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: '请输入用户名和密码' });

    const user = await db.verifyLogin(username, password);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '登录失败' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ── TMDB Proxy ────────────────────────────────────────

app.get('/api/tmdb/:path(*)', async (req, res) => {
  const tmdbPath = req.params.path;
  const apiKey = req.query.api_key || process.env.TMDB_API_KEY;
  if (!apiKey) return res.status(400).json({ error: 'No TMDB API key' });

  const url = new URL(`https://api.themoviedb.org/3/${tmdbPath}`);
  for (const [k, v] of Object.entries(req.query)) {
    if (k !== 'api_key') url.searchParams.set(k, v);
  }
  url.searchParams.set('api_key', apiKey);

  try {
    const tmdbRes = await fetch(url.toString());
    const data = await tmdbRes.json();
    res.status(tmdbRes.status).json(data);
  } catch {
    res.status(502).json({ error: 'TMDB unreachable' });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Lists (user-scoped) ───────────────────────────────

app.get('/api/lists', async (req, res) => {
  try {
    const lists = await db.getAllLists(req.userId);
    res.json(lists);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

app.post('/api/lists', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
    const list = await db.createList({ name: name.trim(), description, userId: req.userId });
    res.status(201).json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

app.put('/api/lists/:id', async (req, res) => {
  try {
    const list = await db.updateList(Number(req.params.id), req.body);
    if (!list) return res.status(404).json({ error: 'List not found' });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: errMsg(err, 'Failed to update list') });
  }
});

app.delete('/api/lists/:id', async (req, res) => {
  try {
    await db.deleteList(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: errMsg(err, 'Failed to delete list') });
  }
});

// ── Movies (list-scoped) ──────────────────────────────

app.get('/api/lists/:listId/movies', async (req, res) => {
  try {
    const { search, status, tag, sort } = req.query;
    const movies = await db.getMoviesByList(Number(req.params.listId), { search, status, tag, sort });
    const parsed = movies.map(m => ({ ...m, tags: safeParseTags(m.tags) }));
    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch movies' });
  }
});

app.post('/api/lists/:listId/movies', async (req, res) => {
  try {
    const { title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });
    if (rating !== undefined && (typeof rating !== 'number' || rating < 0 || rating > 10))
      return res.status(400).json({ error: 'Rating must be 0-10' });
    if (status && !['want_to_watch', 'watched'].includes(status))
      return res.status(400).json({ error: 'Status must be want_to_watch or watched' });
    if (year !== undefined && year !== null && (!Number.isInteger(year) || year < 1888 || year > 2099))
      return res.status(400).json({ error: 'Invalid year' });
    const listId = Number(req.params.listId);
    const list = await db.getListById(listId);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const result = await db.createMovie({
      list_id: listId, title: title.trim(), year, director,
      poster_url, poster_path, tmdb_id, rating, status, notes, tags,
    });
    const movie = await db.getMovieById(result.id);
    movie.tags = safeParseTags(movie.tags);
    res.status(201).json(movie);
  } catch (err) {
    console.error('Create movie error:', err.message, err.stack);
    res.status(500).json({ error: errMsg(err, 'Failed to create movie') });
  }
});

// ── Movie individual (id-scoped) ──────────────────────

app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await db.getMovieById(Number(req.params.id));
    if (!movie) return res.status(404).json({ error: 'Movie not found' });
    movie.tags = safeParseTags(movie.tags);
    res.json(movie);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch movie' });
  }
});

app.put('/api/movies/:id', async (req, res) => {
  try {
    const { rating, status, year } = req.body;
    if (rating !== undefined && (typeof rating !== 'number' || rating < 0 || rating > 10))
      return res.status(400).json({ error: 'Rating must be 0-10' });
    if (status && !['want_to_watch', 'watched'].includes(status))
      return res.status(400).json({ error: 'Status must be want_to_watch or watched' });
    if (year !== undefined && year !== null && (!Number.isInteger(year) || year < 1888 || year > 2099))
      return res.status(400).json({ error: 'Invalid year' });
    const updated = await db.updateMovie(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Movie not found' });
    updated.tags = safeParseTags(updated.tags);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update movie' });
  }
});

app.delete('/api/movies/:id', async (req, res) => {
  try {
    await db.deleteMovie(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

// ── Tags (list-scoped) ────────────────────────────────

app.get('/api/lists/:listId/tags', async (req, res) => {
  try {
    const tags = await db.getTagsByList(Number(req.params.listId));
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// ── Helpers ───────────────────────────────────────────

function safeParseTags(tags) {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

module.exports = app;

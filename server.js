const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health check (for Railway)
app.get('/health', (req, res) => res.json({ ok: true }));

// ── Lists ─────────────────────────────────────────────

app.get('/api/lists', async (req, res) => {
  try {
    const lists = await db.getAllLists();
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
    const list = await db.createList({ name: name.trim(), description });
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
    res.status(500).json({ error: err.message || 'Failed to update list' });
  }
});

app.delete('/api/lists/:id', async (req, res) => {
  try {
    await db.deleteList(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to delete list' });
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
    res.status(500).json({ error: 'Failed to create movie: ' + err.message });
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

// ── Start ─────────────────────────────────────────────

const os = require('os');

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log(`🎬 Movie Watchlist running at:`);
  console.log(`   本机访问: http://localhost:${PORT}`);
  console.log(`   手机访问: http://${ip}:${PORT}`);
});

// Graceful shutdown (for Railway)
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully…');
  server.close(() => process.exit(0));
});

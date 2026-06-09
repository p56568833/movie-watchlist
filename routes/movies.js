const { Router } = require('express');
const db = require('../db');
const { errMsg } = require('../middleware/auth');

const router = Router();

// ── Helpers ───────────────────────────────────────────

function safeParseTags(tags) {
  if (Array.isArray(tags)) return tags;
  try { return JSON.parse(tags); } catch { return []; }
}

function validateRating(rating) {
  if (rating !== undefined && (typeof rating !== 'number' || rating < 0 || rating > 10))
    return 'Rating must be 0-10';
  return null;
}

function validateStatus(status) {
  if (status && !['want_to_watch', 'watched'].includes(status))
    return 'Status must be want_to_watch or watched';
  return null;
}

function validateYear(year) {
  if (year !== undefined && year !== null && (!Number.isInteger(year) || year < 1888 || year > 2099))
    return 'Invalid year';
  return null;
}

// ── List-scoped movies ────────────────────────────────

router.get('/lists/:listId/movies', async (req, res) => {
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

router.post('/lists/:listId/movies', async (req, res) => {
  try {
    const { title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags, tagline } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    const err = validateRating(rating) || validateStatus(status) || validateYear(year);
    if (err) return res.status(400).json({ error: err });

    const listId = Number(req.params.listId);
    const list = await db.getListById(listId);
    if (!list) return res.status(404).json({ error: 'List not found' });

    const result = await db.createMovie({
      list_id: listId, title: title.trim(), year, director,
      poster_url, poster_path, tmdb_id, rating, status, notes, tags, tagline,
    });
    const movie = await db.getMovieById(result.id);
    movie.tags = safeParseTags(movie.tags);
    res.status(201).json(movie);
  } catch (err) {
    console.error('Create movie error:', err.message, err.stack);
    res.status(500).json({ error: errMsg(err, 'Failed to create movie') });
  }
});

router.get('/lists/:listId/tags', async (req, res) => {
  try {
    const tags = await db.getTagsByList(Number(req.params.listId));
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// ── Individual movie ──────────────────────────────────

router.get('/movies/:id', async (req, res) => {
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

router.put('/movies/:id', async (req, res) => {
  try {
    const { rating, status, year } = req.body;

    const err = validateRating(rating) || validateStatus(status) || validateYear(year);
    if (err) return res.status(400).json({ error: err });

    const updated = await db.updateMovie(Number(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Movie not found' });
    updated.tags = safeParseTags(updated.tags);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update movie' });
  }
});

router.delete('/movies/:id', async (req, res) => {
  try {
    await db.deleteMovie(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete movie' });
  }
});

module.exports = router;

const { createClient } = require('@libsql/client');

// ── Client setup ─────────────────────────────────────

const tursoUrl = process.env.TURSO_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

// Turso cloud when credentials present; local SQLite file otherwise (dev + tests)
let client = tursoUrl
  ? createClient({ url: tursoUrl, authToken: tursoToken })
  : createClient({ url: `file:${process.env.DB_PATH || 'movies.db'}` });

let initialized = false;
let initPromise = null;

async function initDb() {
  if (initialized) return;

  // Serialize concurrent init calls
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Check if tables exist
    const rs = await client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='lists'"
    );

    if (rs.rows.length === 0) {
      await client.execute(`
        CREATE TABLE IF NOT EXISTS lists (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      await client.execute(`
        CREATE TABLE IF NOT EXISTS movies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          list_id INTEGER NOT NULL DEFAULT 1,
          title TEXT NOT NULL,
          year INTEGER,
          director TEXT DEFAULT '',
          poster_url TEXT DEFAULT '',
          poster_path TEXT DEFAULT '',
          tmdb_id INTEGER,
          rating INTEGER DEFAULT 0,
          status TEXT DEFAULT 'want_to_watch',
          notes TEXT DEFAULT '',
          tags TEXT DEFAULT '[]',
          created_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE
        )
      `);

      // Create default list if none exists
      const countRs = await client.execute('SELECT COUNT(*) as c FROM lists');
      if (countRs.rows[0].c === 0) {
        await client.execute(
          "INSERT INTO lists (name, description) VALUES ('我的片单', '默认片单')"
        );
      }
    }

    initialized = true;
    initPromise = null;
  })();

  return initPromise;
}

// ── Reset helpers (for tests) ─────────────────────────

function getDb() {
  return client;
}

function flushDb() {
  // Turso writes are synchronous — nothing to flush
}

function resetDb() {
  initialized = false;
  initPromise = null;
  // Close old connection so file handle is released (needed for tests)
  try { client.close(); } catch { /* ok */ }
  // Recreate client pointing to the same URL / file
  client = tursoUrl
    ? createClient({ url: tursoUrl, authToken: tursoToken })
    : createClient({ url: `file:${process.env.DB_PATH || 'movies.db'}` });
}

// ── Lists CRUD ────────────────────────────────────────

async function getAllLists() {
  await initDb();
  const rs = await client.execute('SELECT * FROM lists ORDER BY created_at ASC');
  return rs.rows;
}

async function getListById(id) {
  await initDb();
  const rs = await client.execute({
    sql: 'SELECT * FROM lists WHERE id = ?',
    args: [id],
  });
  return rs.rows[0] || null;
}

async function createList({ name, description }) {
  await initDb();
  const rs = await client.execute({
    sql: 'INSERT INTO lists (name, description) VALUES (?, ?)',
    args: [name, description || ''],
  });
  const id = Number(rs.lastInsertRowid);
  if (!Number.isFinite(id)) throw new Error('Insert failed: no rowid returned');
  return getListById(id);
}

async function updateList(id, { name, description }) {
  await initDb();
  const existing = await getListById(id);
  if (!existing) return null;

  await client.execute({
    sql: 'UPDATE lists SET name=?, description=? WHERE id=?',
    args: [name ?? existing.name, description ?? existing.description, id],
  });
  return getListById(id);
}

async function deleteList(id) {
  await initDb();
  const countRs = await client.execute('SELECT COUNT(*) as c FROM lists');
  if (countRs.rows[0].c <= 1) {
    throw new Error('不能删除最后一个片单');
  }

  // Atomic batch within a transaction
  await client.batch([
    { sql: 'DELETE FROM movies WHERE list_id = ?', args: [id] },
    { sql: 'DELETE FROM lists WHERE id = ?', args: [id] },
  ], 'write');

  return { deleted: true };
}

// ── Movies CRUD (list-scoped) ─────────────────────────

async function getMoviesByList(listId, { search, status, tag, sort } = {}) {
  await initDb();
  let sql = 'SELECT * FROM movies WHERE list_id = ?';
  const params = [listId];

  if (search) {
    sql += ' AND (title LIKE ? OR director LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (tag) {
    sql += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }

  if (sort === 'title') sql += ' ORDER BY title ASC';
  else if (sort === 'year') sql += ' ORDER BY year DESC';
  else if (sort === 'rating') sql += ' ORDER BY rating DESC';
  else sql += ' ORDER BY created_at DESC';

  const rs = await client.execute({ sql, args: params });
  return rs.rows;
}

async function getMovieById(id) {
  await initDb();
  const rs = await client.execute({
    sql: 'SELECT * FROM movies WHERE id = ?',
    args: [id],
  });
  return rs.rows[0] || null;
}

async function createMovie({ list_id, title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags }) {
  await initDb();
  const rs = await client.execute({
    sql: `INSERT INTO movies (list_id, title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      list_id,
      title,
      year || null,
      director || '',
      poster_url || '',
      poster_path || '',
      tmdb_id || null,
      rating || 0,
      status || 'want_to_watch',
      notes || '',
      JSON.stringify(tags || []),
    ],
  });
  const id = Number(rs.lastInsertRowid);
  if (!Number.isFinite(id)) throw new Error('Insert failed: no rowid returned');
  return getMovieById(id);
}

async function updateMovie(id, fields) {
  await initDb();
  const existing = await getMovieById(id);
  if (!existing) return null;

  const set = (key, fallback) => fields[key] !== undefined ? fields[key] : existing[key];
  const title = set('title');
  const year = set('year');
  const director = set('director');
  const poster_url = set('poster_url');
  const poster_path = set('poster_path');
  const tmdb_id = set('tmdb_id');
  const rating = set('rating');
  const status = set('status');
  const notes = set('notes');
  const tags = fields.tags !== undefined ? JSON.stringify(fields.tags) : existing.tags;
  const list_id = set('list_id');

  await client.execute({
    sql: `UPDATE movies SET title=?, year=?, director=?, poster_url=?, poster_path=?, tmdb_id=?, rating=?, status=?, notes=?, tags=?, list_id=? WHERE id=?`,
    args: [title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags, list_id, id],
  });
  return getMovieById(id);
}

async function deleteMovie(id) {
  await initDb();
  await client.execute({ sql: 'DELETE FROM movies WHERE id = ?', args: [id] });
  return { deleted: true };
}

async function getTagsByList(listId) {
  await initDb();
  const movies = await getMoviesByList(listId);
  const tagSet = new Set();
  for (const m of movies) {
    let t;
    try { t = JSON.parse(m.tags); } catch { t = []; }
    if (Array.isArray(t)) t.forEach(tag => tagSet.add(tag));
  }
  return [...tagSet].sort();
}

module.exports = {
  getDb,
  getAllLists, getListById, createList, updateList, deleteList,
  getMoviesByList, getMovieById, createMovie, updateMovie, deleteMovie,
  getTagsByList,
  flushDb,
  resetDb,
};

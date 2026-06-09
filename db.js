const { createClient } = require('@libsql/client');
const crypto = require('crypto');

// ── Client setup ─────────────────────────────────────

const tursoUrl = process.env.TURSO_URL;
const tursoToken = process.env.TURSO_AUTH_TOKEN;

let client = tursoUrl
  ? createClient({ url: tursoUrl, authToken: tursoToken })
  : createClient({ url: `file:${process.env.DB_PATH || 'movies.db'}` });

let initialized = false;
let initPromise = null;

async function initDb() {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // Create users table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create lists table
    await client.execute(`
      CREATE TABLE IF NOT EXISTS lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Add user_id column to existing lists (migration)
    try {
      await client.execute('ALTER TABLE lists ADD COLUMN user_id INTEGER');
    } catch { /* already exists */ }

    // Create movies table
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

    initialized = true;
    initPromise = null;
  })();

  return initPromise;
}

// ── User helpers ─────────────────────────────────────

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verify = crypto.scryptSync(password, salt, 64).toString('hex');
  return verify === hash;
}

// ── Reset helpers (for tests) ─────────────────────────

function getDb() { return client; }
function flushDb() { /* no-op for Turso */ }

function resetDb() {
  initialized = false;
  initPromise = null;
  try { client.close(); } catch { /* ok */ }
  client = tursoUrl
    ? createClient({ url: tursoUrl, authToken: tursoToken })
    : createClient({ url: `file:${process.env.DB_PATH || 'movies.db'}` });
}

// ── Users CRUD ───────────────────────────────────────

async function createUser(username, password) {
  await initDb();
  const hash = hashPassword(password);
  const rs = await client.execute({
    sql: 'INSERT INTO users (username, password_hash) VALUES (?, ?)',
    args: [username, hash],
  });
  const id = Number(rs.lastInsertRowid);

  // First user claims all legacy (user_id IS NULL) lists
  await client.execute({
    sql: 'UPDATE lists SET user_id = ? WHERE user_id IS NULL',
    args: [id],
  });

  // Create default list for this user
  await client.execute({
    sql: 'INSERT INTO lists (user_id, name, description) VALUES (?, ?, ?)',
    args: [id, '我的片单', '默认片单'],
  });

  return getUserById(id);
}

async function getUserByUsername(username) {
  await initDb();
  const rs = await client.execute({
    sql: 'SELECT * FROM users WHERE username = ?',
    args: [username],
  });
  return rs.rows[0] || null;
}

async function getUserById(id) {
  await initDb();
  const rs = await client.execute({
    sql: 'SELECT id, username, created_at FROM users WHERE id = ?',
    args: [id],
  });
  return rs.rows[0] || null;
}

async function verifyLogin(username, password) {
  const user = await getUserByUsername(username);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;
  return { id: user.id, username: user.username };
}

// ── Lists CRUD (user-scoped) ─────────────────────────

async function getAllLists(userId) {
  await initDb();
  const rs = await client.execute({
    sql: 'SELECT * FROM lists WHERE user_id = ? ORDER BY created_at ASC',
    args: [userId],
  });
  // Fallback: if no lists for this user, create default
  if (rs.rows.length === 0) {
    await client.execute({
      sql: 'INSERT INTO lists (user_id, name, description) VALUES (?, ?, ?)',
      args: [userId, '我的片单', '默认片单'],
    });
    return getAllLists(userId);
  }
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

async function createList({ name, description, userId }) {
  await initDb();
  const rs = await client.execute({
    sql: 'INSERT INTO lists (user_id, name, description) VALUES (?, ?, ?)',
    args: [userId, name, description || ''],
  });
  const id = Number(rs.lastInsertRowid);
  if (!Number.isFinite(id)) throw new Error('Insert failed');
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
  const list = await getListById(id);
  if (!list) throw new Error('片单不存在');

  const countRs = await client.execute({
    sql: 'SELECT COUNT(*) as c FROM lists WHERE user_id = ?',
    args: [list.user_id],
  });
  if (countRs.rows[0].c <= 1) {
    throw new Error('不能删除最后一个片单');
  }

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
      list_id, title, year || null, director || '', poster_url || '', poster_path || '',
      tmdb_id || null, rating || 0, status || 'want_to_watch', notes || '', JSON.stringify(tags || []),
    ],
  });
  const id = Number(rs.lastInsertRowid);
  if (!Number.isFinite(id)) throw new Error('Insert failed');
  return getMovieById(id);
}

async function updateMovie(id, fields) {
  await initDb();
  const existing = await getMovieById(id);
  if (!existing) return null;

  if (fields.list_id !== undefined) {
    const targetList = await getListById(fields.list_id);
    if (!targetList) throw new Error('目标片单不存在');
  }

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
  createUser, getUserByUsername, getUserById, verifyLogin,
  getAllLists, getListById, createList, updateList, deleteList,
  getMoviesByList, getMovieById, createMovie, updateMovie, deleteMovie,
  getTagsByList,
  flushDb, resetDb,
};

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'movies.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    migrate(db);
  } else {
    db = new SQL.Database();
    createTables(db);
  }

  save();
  return db;
}

// ── Schema ────────────────────────────────────────────

function createTables(d) {
  d.run(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  d.run(`
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
  const count = d.exec('SELECT COUNT(*) as c FROM lists');
  if (count.length && count[0].values[0][0] === 0) {
    d.run(`INSERT INTO lists (name, description) VALUES ('我的片单', '默认片单')`);
  }
}

function migrate(d) {
  // Detect if migration is needed
  let hasLists = false;
  try {
    d.exec('SELECT 1 FROM lists LIMIT 1');
    hasLists = true;
  } catch { /* table doesn't exist */ }

  if (!hasLists) {
    // Create lists table
    d.run(`
      CREATE TABLE IF NOT EXISTS lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
    d.run(`INSERT INTO lists (name, description) VALUES ('我的片单', '默认片单')`);

    // Add new columns to existing movies table (ignore errors if already exist)
    for (const col of [
      'list_id INTEGER NOT NULL DEFAULT 1',
      'tmdb_id INTEGER',
      'poster_path TEXT DEFAULT \'\'',
    ]) {
      try { d.run(`ALTER TABLE movies ADD COLUMN ${col}`); } catch { /* already exists */ }
    }

    // Assign existing movies to default list
    try { d.run(`UPDATE movies SET list_id = 1 WHERE list_id IS NULL OR list_id = 0`); } catch { /* no rows */ }

    save();
  }
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ── Lists CRUD ────────────────────────────────────────

async function getAllLists() {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM lists ORDER BY created_at ASC');
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function getListById(id) {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM lists WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

async function createList({ name, description }) {
  const d = await getDb();
  const stmt = d.prepare('INSERT INTO lists (name, description) VALUES (?, ?)');
  stmt.bind([name, description || '']);
  stmt.step();
  stmt.free();

  const idStmt = d.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();
  save();
  return getListById(id);
}

async function updateList(id, { name, description }) {
  const d = await getDb();
  const existing = await getListById(id);
  if (!existing) return null;

  const stmt = d.prepare('UPDATE lists SET name=?, description=? WHERE id=?');
  stmt.bind([name ?? existing.name, description ?? existing.description, id]);
  stmt.step();
  stmt.free();
  save();
  return getListById(id);
}

async function deleteList(id) {
  const d = await getDb();
  // Prevent deleting the last list
  const count = d.exec('SELECT COUNT(*) as c FROM lists');
  if (count.length && count[0].values[0][0] <= 1) {
    throw new Error('不能删除最后一个片单');
  }
  // Cascade: delete all movies in this list first
  let stmt = d.prepare('DELETE FROM movies WHERE list_id = ?');
  stmt.bind([id]); stmt.step(); stmt.free();
  stmt = d.prepare('DELETE FROM lists WHERE id = ?');
  stmt.bind([id]); stmt.step(); stmt.free();
  save();
  return { deleted: true };
}

// ── Movies CRUD (list-scoped) ─────────────────────────

async function getMoviesByList(listId, { search, status, tag, sort } = {}) {
  const d = await getDb();
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

  const stmt = d.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function getMovieById(id) {
  const d = await getDb();
  const stmt = d.prepare('SELECT * FROM movies WHERE id = ?');
  stmt.bind([id]);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

async function createMovie({ list_id, title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags }) {
  const d = await getDb();
  const stmt = d.prepare(
    `INSERT INTO movies (list_id, title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.bind([
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
  ]);
  stmt.step();
  stmt.free();

  const idStmt = d.prepare('SELECT last_insert_rowid() as id');
  idStmt.step();
  const { id } = idStmt.getAsObject();
  idStmt.free();
  save();
  return getMovieById(id);
}

async function updateMovie(id, fields) {
  const d = await getDb();
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

  const stmt = d.prepare(
    `UPDATE movies SET title=?, year=?, director=?, poster_url=?, poster_path=?, tmdb_id=?, rating=?, status=?, notes=?, tags=?, list_id=? WHERE id=?`
  );
  stmt.bind([title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags, list_id, id]);
  stmt.step();
  stmt.free();
  save();
  return getMovieById(id);
}

async function deleteMovie(id) {
  const d = await getDb();
  const stmt = d.prepare('DELETE FROM movies WHERE id = ?');
  stmt.bind([id]);
  stmt.step();
  stmt.free();
  save();
  return { deleted: true };
}

async function getTagsByList(listId) {
  const d = await getDb();
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
};

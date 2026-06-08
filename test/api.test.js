// API integration tests — uses Node 22 built-in test runner
// Run: node --test test/api.test.js

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Use a temp file so tests don't touch the real database
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moviedb-'));
const DB_PATH = path.join(tmpDir, 'test.db');
process.env.DB_PATH = DB_PATH;

// Must come after DB_PATH is set
const db = require('../db');
const app = require('../app');

let server;
let baseURL;

before(async () => {
  // Start server on random port
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseURL = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  // Flush + reset to release DB handle, then clean up temp files
  db.flushDb();
  db.resetDb();
  try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ok */ }
});

beforeEach(async () => {
  // Reset DB to a clean state for each top-level describe block
  db.resetDb();
  // Delete the temp file so next getDb() creates a fresh DB
  try { fs.unlinkSync(DB_PATH); } catch { /* ok */ }
});

// ═══════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await fetch(`${baseURL}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { ok: true });
  });
});

// ═══════════════════════════════════════════════════════
// Lists CRUD
// ═══════════════════════════════════════════════════════

describe('Lists API', () => {
  it('GET /api/lists returns default list', async () => {
    const res = await fetch(`${baseURL}/api/lists`);
    assert.strictEqual(res.status, 200);
    const lists = await res.json();
    assert.ok(Array.isArray(lists));
    assert.strictEqual(lists.length, 1);
    assert.strictEqual(lists[0].name, '我的片单');
  });

  it('POST /api/lists creates a new list', async () => {
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '经典电影' }),
    });
    assert.strictEqual(res.status, 201);
    const list = await res.json();
    assert.strictEqual(list.name, '经典电影');

    // Verify it's in the list
    const res2 = await fetch(`${baseURL}/api/lists`);
    const lists = await res2.json();
    assert.strictEqual(lists.length, 2);
  });

  it('POST /api/lists rejects empty name', async () => {
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Name is required');
  });

  it('POST /api/lists rejects missing name', async () => {
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
  });

  it('PUT /api/lists/:id updates name and description', async () => {
    const res = await fetch(`${baseURL}/api/lists/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '已改名', description: '新描述' }),
    });
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert.strictEqual(list.name, '已改名');
    assert.strictEqual(list.description, '新描述');
  });

  it('PUT /api/lists/:id returns 404 for non-existent list', async () => {
    const res = await fetch(`${baseURL}/api/lists/999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    });
    assert.strictEqual(res.status, 404);
  });

  it('DELETE /api/lists/:id refuses last list', async () => {
    const res = await fetch(`${baseURL}/api/lists/1`, { method: 'DELETE' });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('最后一个'));
  });

  it('DELETE /api/lists/:id works when multiple lists exist', async () => {
    // Create a second list first
    await fetch(`${baseURL}/api/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '可删除' }),
    });

    const res = await fetch(`${baseURL}/api/lists/2`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.deepStrictEqual(body, { ok: true });

    // Only default list remains
    const listsRes = await fetch(`${baseURL}/api/lists`);
    const lists = await listsRes.json();
    assert.strictEqual(lists.length, 1);
  });
});

// ═══════════════════════════════════════════════════════
// Movies CRUD
// ═══════════════════════════════════════════════════════

describe('Movies API', () => {
  it('POST /api/lists/:id/movies creates a movie', async () => {
    const res = await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '寄生虫', year: 2019, rating: 5, status: 'watched' }),
    });
    assert.strictEqual(res.status, 201);
    const movie = await res.json();
    assert.strictEqual(movie.title, '寄生虫');
    assert.strictEqual(movie.year, 2019);
    assert.strictEqual(movie.rating, 5);
    assert.strictEqual(movie.status, 'watched');
    assert.ok(movie.id > 0);
    assert.ok(Array.isArray(movie.tags));
  });

  it('POST /api/lists/:id/movies rejects missing title', async () => {
    const res = await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2020 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/lists/:id/movies rejects invalid rating', async () => {
    const res = await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', rating: 10 }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Rating must be 0-5');
  });

  it('POST /api/lists/:id/movies rejects invalid status', async () => {
    const res = await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', status: 'invalid' }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.ok(body.error.includes('Status'));
  });

  it('POST /api/lists/:id/movies rejects invalid year', async () => {
    const res = await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', year: 1800 }),
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error, 'Invalid year');
  });

  it('POST /api/lists/:id/movies returns 404 for non-existent list', async () => {
    const res = await fetch(`${baseURL}/api/lists/999/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test' }),
    });
    assert.strictEqual(res.status, 404);
  });

  it('GET /api/lists/:id/movies returns movies with parsed tags', async () => {
    // Add a movie with tags
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A', tags: ['韩国', '剧情'] }),
    });

    const res = await fetch(`${baseURL}/api/lists/1/movies`);
    assert.strictEqual(res.status, 200);
    const movies = await res.json();
    assert.strictEqual(movies.length, 1);
    assert.deepStrictEqual(movies[0].tags, ['韩国', '剧情']);
  });

  it('GET /api/lists/:id/movies supports search filter', async () => {
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '寄生虫' }),
    });
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '蝙蝠' }),
    });

    const res = await fetch(`${baseURL}/api/lists/1/movies?search=寄生`);
    const movies = await res.json();
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, '寄生虫');
  });

  it('GET /api/lists/:id/movies supports status filter', async () => {
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '已看片', status: 'watched' }),
    });
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '想看片', status: 'want_to_watch' }),
    });

    const res = await fetch(`${baseURL}/api/lists/1/movies?status=watched`);
    const movies = await res.json();
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, '已看片');
  });

  it('GET /api/lists/:id/movies supports tag filter', async () => {
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'T1', tags: ['韩国'] }),
    });
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'T2', tags: ['美国'] }),
    });

    const res = await fetch(`${baseURL}/api/lists/1/movies?tag=韩国`);
    const movies = await res.json();
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, 'T1');
  });

  it('GET /api/lists/:id/movies supports sort', async () => {
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'C', year: 2020 }),
    });
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'A', year: 2010 }),
    });

    const res = await fetch(`${baseURL}/api/lists/1/movies?sort=title`);
    const movies = await res.json();
    assert.strictEqual(movies[0].title, 'A');
    assert.strictEqual(movies[1].title, 'C');
  });
});

// ═══════════════════════════════════════════════════════
// Individual Movie
// ═══════════════════════════════════════════════════════

describe('Individual Movie API', () => {
  let movieId;

  beforeEach(async () => {
    const res = await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '测试电影', year: 2023, rating: 4 }),
    });
    const movie = await res.json();
    movieId = movie.id;
  });

  it('GET /api/movies/:id returns a movie', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`);
    assert.strictEqual(res.status, 200);
    const movie = await res.json();
    assert.strictEqual(movie.title, '测试电影');
    assert.strictEqual(movie.rating, 4);
    assert.ok(Array.isArray(movie.tags));
  });

  it('GET /api/movies/:id returns 404 for missing movie', async () => {
    const res = await fetch(`${baseURL}/api/movies/99999`);
    assert.strictEqual(res.status, 404);
  });

  it('PUT /api/movies/:id updates fields', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '新标题', rating: 3, status: 'want_to_watch' }),
    });
    assert.strictEqual(res.status, 200);
    const movie = await res.json();
    assert.strictEqual(movie.title, '新标题');
    assert.strictEqual(movie.rating, 3);
    assert.strictEqual(movie.status, 'want_to_watch');
  });

  it('PUT /api/movies/:id validates rating', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: -1 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('PUT /api/movies/:id validates status', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'bad_status' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('PUT /api/movies/:id validates year', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 3000 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('PUT /api/movies/:id returns 404 for non-existent', async () => {
    const res = await fetch(`${baseURL}/api/movies/99999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });
    assert.strictEqual(res.status, 404);
  });

  it('DELETE /api/movies/:id deletes a movie', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, { method: 'DELETE' });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });

    // Verify it's gone
    const res2 = await fetch(`${baseURL}/api/movies/${movieId}`);
    assert.strictEqual(res2.status, 404);
  });
});

// ═══════════════════════════════════════════════════════
// Tags
// ═══════════════════════════════════════════════════════

describe('Tags API', () => {
  it('GET /api/lists/:id/tags returns sorted unique tags', async () => {
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'M1', tags: ['韩国', '剧情'] }),
    });
    await fetch(`${baseURL}/api/lists/1/movies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'M2', tags: ['韩国', '动作'] }),
    });

    const res = await fetch(`${baseURL}/api/lists/1/tags`);
    assert.strictEqual(res.status, 200);
    const tags = await res.json();
    assert.deepStrictEqual(tags, ['剧情', '动作', '韩国']); // sorted alphabetically
  });
});

// ═══════════════════════════════════════════════════════
// Error message sanitization in production
// ═══════════════════════════════════════════════════════

describe('Error sanitization', () => {
  it('does not leak error details in production', async () => {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      // Trigger an error: try to delete the last list (will throw)
      const res = await fetch(`${baseURL}/api/lists/1`, { method: 'DELETE' });
      const body = await res.json();
      // In production, should return generic fallback, not the raw error
      assert.strictEqual(body.error, 'Failed to delete list');
      assert.ok(!body.error.includes('最后一个'));
    } finally {
      process.env.NODE_ENV = prevEnv;
    }
  });
});

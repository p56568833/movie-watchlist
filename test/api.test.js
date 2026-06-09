// API integration tests — uses Node 22 built-in test runner
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

process.env.DB_PATH = ':memory:';

const db = require('../db');
const app = require('../app');

let server;
let baseURL;
let token;
let userId;

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseURL = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  // Register test user
  const res = await fetch(`${baseURL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'tester', password: 'pass123' }),
  });
  const data = await res.json();
  token = data.token;
  userId = data.user.id;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  db.resetDb();
});

function authHeaders() {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };
}

// ═══════════════════════════════════════════════════════
// Auth
// ═══════════════════════════════════════════════════════

describe('Auth', () => {
  it('register creates user and returns token', async () => {
    const res = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newuser', password: 'abc123' }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.ok(data.token);
    assert.strictEqual(data.user.username, 'newuser');
  });

  it('login returns token for valid credentials', async () => {
    const res = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tester', password: 'pass123' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.token);
  });

  it('login rejects wrong password', async () => {
    const res = await fetch(`${baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'tester', password: 'wrong' }),
    });
    assert.strictEqual(res.status, 401);
  });

  it('api returns 401 without token', async () => {
    const res = await fetch(`${baseURL}/api/lists`);
    assert.strictEqual(res.status, 401);
  });

  it('me returns the verified token user without a database lookup', async () => {
    const registerRes = await fetch(`${baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'device-user', password: 'pass123' }),
    });
    const registered = await registerRes.json();

    await db.getDb().execute({
      sql: 'DELETE FROM users WHERE id = ?',
      args: [registered.user.id],
    });

    const res = await fetch(`${baseURL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${registered.token}` },
    });

    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), {
      id: registered.user.id,
      username: registered.user.username,
    });
  });
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
    const res = await fetch(`${baseURL}/api/lists`, { headers: authHeaders() });
    assert.strictEqual(res.status, 200);
    const lists = await res.json();
    assert.ok(Array.isArray(lists));
    assert.strictEqual(lists.length, 1);
    assert.strictEqual(lists[0].name, '我的片单');
  });

  it('POST /api/lists creates a new list', async () => {
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: '经典电影' }),
    });
    assert.strictEqual(res.status, 201);
    const list = await res.json();
    assert.strictEqual(list.name, '经典电影');

    const res2 = await fetch(`${baseURL}/api/lists`, { headers: authHeaders() });
    const lists = await res2.json();
    assert.strictEqual(lists.length, 2);
  });

  it('POST /api/lists rejects empty name', async () => {
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: '   ' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST /api/lists rejects missing name', async () => {
    const res = await fetch(`${baseURL}/api/lists`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({}),
    });
    assert.strictEqual(res.status, 400);
  });

  it('PUT /api/lists/:id updates name and description', async () => {
    const lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    const id = lists[0].id;
    const res = await fetch(`${baseURL}/api/lists/${id}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ name: '已改名', description: '新描述' }),
    });
    assert.strictEqual(res.status, 200);
    const list = await res.json();
    assert.strictEqual(list.name, '已改名');
    assert.strictEqual(list.description, '新描述');
  });

  it('PUT /api/lists/:id returns 404 for non-existent list', async () => {
    const res = await fetch(`${baseURL}/api/lists/999`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ name: 'x' }),
    });
    assert.strictEqual(res.status, 404);
  });

  it('DELETE /api/lists/:id refuses last list', async () => {
    // Delete all but one list first
    let lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    for (const l of lists.slice(1)) {
      await fetch(`${baseURL}/api/lists/${l.id}`, { method: 'DELETE', headers: authHeaders() });
    }
    lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    assert.strictEqual(lists.length, 1);
    const res = await fetch(`${baseURL}/api/lists/${lists[0].id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    assert.strictEqual(res.status, 400);
  });

  it('DELETE /api/lists/:id works when multiple lists exist', async () => {
    // Create a second list
    await fetch(`${baseURL}/api/lists`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name: '可删除' }),
    });
    const lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    const toDelete = lists.find(l => l.name === '可删除');
    const res = await fetch(`${baseURL}/api/lists/${toDelete.id}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
  });
});

// ═══════════════════════════════════════════════════════
// Movies CRUD
// ═══════════════════════════════════════════════════════

describe('Movies API', () => {
  let listId;

  before(async () => {
    const lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    listId = lists[0].id;
  });

  it('POST /api/lists/:id/movies creates a movie', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
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

  it('POST rejects missing title', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ year: 2020 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST rejects invalid rating', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Test', rating: 11 }),
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'Rating must be 0-10');
  });

  it('POST rejects invalid status', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Test', status: 'invalid' }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST rejects invalid year', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Test', year: 1800 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('POST returns 404 for non-existent list', async () => {
    const res = await fetch(`${baseURL}/api/lists/99999/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'Test' }),
    });
    assert.strictEqual(res.status, 404);
  });

  it('GET returns movies with parsed tags', async () => {
    await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'A', tags: ['韩国', '剧情'] }),
    });
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, { headers: authHeaders() });
    const movies = await res.json();
    assert.ok(movies.length > 0);
    const m = movies.find(x => x.title === 'A');
    assert.deepStrictEqual(m.tags, ['韩国', '剧情']);
  });

  it('GET supports search filter', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies?search=寄生`, { headers: authHeaders() });
    const movies = await res.json();
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, '寄生虫');
  });

  it('GET supports status filter', async () => {
    await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: '想看片', status: 'want_to_watch' }),
    });
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies?status=watched`, { headers: authHeaders() });
    const movies = await res.json();
    assert.ok(movies.every(m => m.status === 'watched'));
  });

  it('GET supports tag filter', async () => {
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies?tag=韩国`, { headers: authHeaders() });
    const movies = await res.json();
    assert.ok(movies.every(m => m.tags.includes('韩国')));
  });
});

// ═══════════════════════════════════════════════════════
// Individual Movie
// ═══════════════════════════════════════════════════════

describe('Individual Movie API', () => {
  let listId, movieId;

  before(async () => {
    const lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    listId = lists[0].id;
    const res = await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: '测试电影', year: 2023, rating: 4 }),
    });
    movieId = (await res.json()).id;
  });

  it('GET /api/movies/:id returns a movie', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, { headers: authHeaders() });
    assert.strictEqual(res.status, 200);
    const movie = await res.json();
    assert.strictEqual(movie.title, '测试电影');
    assert.strictEqual(movie.rating, 4);
    assert.ok(Array.isArray(movie.tags));
  });

  it('GET /api/movies/:id returns 404 for missing movie', async () => {
    const res = await fetch(`${baseURL}/api/movies/99999`, { headers: authHeaders() });
    assert.strictEqual(res.status, 404);
  });

  it('PUT /api/movies/:id updates fields', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ title: '新标题', rating: 3, status: 'want_to_watch' }),
    });
    assert.strictEqual(res.status, 200);
    const movie = await res.json();
    assert.strictEqual(movie.title, '新标题');
    assert.strictEqual(movie.rating, 3);
  });

  it('PUT validates rating', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ rating: -1 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('PUT validates year', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ year: 3000 }),
    });
    assert.strictEqual(res.status, 400);
  });

  it('DELETE /api/movies/:id deletes a movie', async () => {
    const res = await fetch(`${baseURL}/api/movies/${movieId}`, {
      method: 'DELETE', headers: authHeaders(),
    });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });

    const res2 = await fetch(`${baseURL}/api/movies/${movieId}`, { headers: authHeaders() });
    assert.strictEqual(res2.status, 404);
  });
});

// ═══════════════════════════════════════════════════════
// Tags
// ═══════════════════════════════════════════════════════

describe('Tags API', () => {
  let listId;

  before(async () => {
    const lists = await (await fetch(`${baseURL}/api/lists`, { headers: authHeaders() })).json();
    listId = lists[0].id;
  });

  it('GET /api/lists/:id/tags returns sorted unique tags', async () => {
    await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'M1', tags: ['韩国', '剧情'] }),
    });
    await fetch(`${baseURL}/api/lists/${listId}/movies`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: 'M2', tags: ['韩国', '动作'] }),
    });
    const res = await fetch(`${baseURL}/api/lists/${listId}/tags`, { headers: authHeaders() });
    const tags = await res.json();
    assert.deepStrictEqual(tags, ['剧情', '动作', '韩国']);
  });
});

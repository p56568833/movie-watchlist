// Database unit tests — uses Node 22 built-in test runner
// Run: node --test test/db.test.js

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Use in-memory SQLite for tests
process.env.DB_PATH = ':memory:';

const db = require('../db');

let userId;

before(async () => {
  // Create test user
  const user = await db.createUser('test', 'password123');
  userId = user.id;
});

after(() => {
  db.resetDb();
});

// ═══════════════════════════════════════════════════════
// Schema & migration
// ═══════════════════════════════════════════════════════

describe('Schema initialization', () => {
  it('creates default list for user on fresh DB', async () => {
    db.resetDb();
    // Re-create test user
    const u = await db.createUser('test2', 'pw');
    const lists = await db.getAllLists(u.id);
    assert.strictEqual(lists.length, 1);
    assert.strictEqual(lists[0].name, '我的片单');
  });

  it('default list has expected shape', async () => {
    const lists = await db.getAllLists(userId);
    const list = lists[0];
    assert.ok(list);
    assert.strictEqual(typeof list.id, 'number');
    assert.strictEqual(typeof list.name, 'string');
    assert.ok('description' in list);
    assert.ok('created_at' in list);
  });
});

// ═══════════════════════════════════════════════════════
// Lists CRUD (edge cases)
// ═══════════════════════════════════════════════════════

describe('Lists CRUD edge cases', () => {
  it('getListById returns null for non-existent list', async () => {
    const list = await db.getListById(99999);
    assert.strictEqual(list, null);
  });

  it('createList with empty description defaults to empty string', async () => {
    const list = await db.createList({ name: 'Test', description: undefined, userId });
    assert.strictEqual(list.description, '');
  });

  it('updateList with partial fields preserves existing values', async () => {
    const list = await db.createList({ name: 'Original', description: 'Desc', userId });
    const updated = await db.updateList(list.id, { name: 'New' });
    assert.strictEqual(updated.name, 'New');
    assert.strictEqual(updated.description, 'Desc');
  });

  it('updateList returns null for non-existent list', async () => {
    const result = await db.updateList(99999, { name: 'x' });
    assert.strictEqual(result, null);
  });

  it('deleteList cascades movies', async () => {
    const list = await db.createList({ name: 'ToDelete', userId });
    const lists = await db.getAllLists(userId);
    const listId = list.id;
    await db.createMovie({ list_id: listId, title: 'Movie in deleted list' });
    await db.createMovie({ list_id: listId, title: 'Another' });

    const before = await db.getMoviesByList(listId);
    assert.strictEqual(before.length, 2);

    // Need a second list to allow deletion
    await db.createList({ name: 'Keep', userId });
    await db.deleteList(listId);

    const movies = await db.getMoviesByList(listId);
    assert.strictEqual(movies.length, 0);
  });
});

// ═══════════════════════════════════════════════════════
// Users
// ═══════════════════════════════════════════════════════

describe('Users', () => {
  it('createUser and verifyLogin', async () => {
    const u = await db.createUser('alice', 'secret123');
    assert.strictEqual(u.username, 'alice');
    assert.ok(u.id > 0);

    const ok = await db.verifyLogin('alice', 'secret123');
    assert.ok(ok);
    assert.strictEqual(ok.username, 'alice');

    const fail = await db.verifyLogin('alice', 'wrong');
    assert.strictEqual(fail, null);
  });

  it('duplicate username fails', async () => {
    try {
      await db.createUser('alice', 'another');
      assert.fail('Should have thrown');
    } catch (e) {
      assert.ok(e.message.includes('UNIQUE'));
    }
  });
});

// ═══════════════════════════════════════════════════════
// Movies CRUD (edge cases)
// ═══════════════════════════════════════════════════════

describe('Movies CRUD edge cases', () => {
  let listId;

  before(async () => {
    const list = await db.createList({ name: 'Movies', userId });
    listId = list.id;
  });

  it('getMovieById returns null for non-existent', async () => {
    const movie = await db.getMovieById(99999);
    assert.strictEqual(movie, null);
  });

  it('createMovie with all optional fields omitted uses defaults', async () => {
    const m = await db.createMovie({ list_id: listId, title: 'Minimal' });
    const movie = await db.getMovieById(m.id);
    assert.strictEqual(movie.year, null);
    assert.strictEqual(movie.director, '');
    assert.strictEqual(movie.rating, 0);
    assert.strictEqual(movie.status, 'want_to_watch');
    assert.strictEqual(movie.notes, '');
    assert.strictEqual(movie.tags, '[]');
  });

  it('updateMovie preserves fields not in update payload', async () => {
    const { id } = await db.createMovie({
      list_id: listId, title: 'Full', year: 2020, director: 'Dir', rating: 3, status: 'watched',
    });
    await db.updateMovie(id, { title: 'Updated' });
    const movie = await db.getMovieById(id);
    assert.strictEqual(movie.title, 'Updated');
    assert.strictEqual(movie.year, 2020);
    assert.strictEqual(movie.director, 'Dir');
    assert.strictEqual(movie.rating, 3);
    assert.strictEqual(movie.status, 'watched');
  });

  it('updateMovie returns null for non-existent', async () => {
    const result = await db.updateMovie(99999, { title: 'x' });
    assert.strictEqual(result, null);
  });

  it('deleteMovie only removes the targeted movie', async () => {
    const m1 = await db.createMovie({ list_id: listId, title: 'Keep' });
    const m2 = await db.createMovie({ list_id: listId, title: 'Delete' });
    await db.deleteMovie(m2.id);
    const keep = await db.getMovieById(m1.id);
    assert.ok(keep);
    assert.strictEqual(keep.title, 'Keep');
    const deleted = await db.getMovieById(m2.id);
    assert.strictEqual(deleted, null);
  });

  it('getMoviesByList with tag filter', async () => {
    const l = await db.createList({ name: 'TagFilter', userId });
    await db.createMovie({ list_id: l.id, title: 'T1', tags: ['韩国', '剧情'] });
    await db.createMovie({ list_id: l.id, title: 'T2', tags: ['美国'] });
    const movies = await db.getMoviesByList(l.id, { tag: '韩国' });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, 'T1');
  });

  it('getMoviesByList sort by year desc', async () => {
    const l = await db.createList({ name: 'SortYear', userId });
    await db.createMovie({ list_id: l.id, title: 'Old', year: 1990 });
    await db.createMovie({ list_id: l.id, title: 'New', year: 2020 });
    const movies = await db.getMoviesByList(l.id, { sort: 'year' });
    assert.strictEqual(movies[0].title, 'New');
    assert.strictEqual(movies[1].title, 'Old');
  });

  it('getMoviesByList sort by rating desc', async () => {
    const l = await db.createList({ name: 'SortRating', userId });
    await db.createMovie({ list_id: l.id, title: 'Low', rating: 1 });
    await db.createMovie({ list_id: l.id, title: 'High', rating: 5 });
    const movies = await db.getMoviesByList(l.id, { sort: 'rating' });
    assert.strictEqual(movies[0].title, 'High');
    assert.strictEqual(movies[1].title, 'Low');
  });

  it('getMoviesByList search matches title and director', async () => {
    const l = await db.createList({ name: 'Search', userId });
    await db.createMovie({ list_id: l.id, title: '寄生虫', director: '奉俊昊' });
    await db.createMovie({ list_id: l.id, title: '蝙蝠', director: '朴赞郁' });
    let movies = await db.getMoviesByList(l.id, { search: '寄生' });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, '寄生虫');
    movies = await db.getMoviesByList(l.id, { search: '奉俊昊' });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].director, '奉俊昊');
  });
});

// ═══════════════════════════════════════════════════════
// Tags
// ═══════════════════════════════════════════════════════

describe('Tags', () => {
  let listId;

  before(async () => {
    const list = await db.createList({ name: 'TagTest', userId });
    listId = list.id;
  });

  it('getTagsByList returns deduplicated sorted tags', async () => {
    await db.createMovie({ list_id: listId, title: 'M1', tags: ['韩国', '剧情'] });
    await db.createMovie({ list_id: listId, title: 'M2', tags: ['韩国', '动作'] });
    const tags = await db.getTagsByList(listId);
    assert.deepStrictEqual(tags, ['剧情', '动作', '韩国']);
  });

  it('getTagsByList returns empty array for list with no movies', async () => {
    const l = await db.createList({ name: 'Empty', userId });
    const tags = await db.getTagsByList(l.id);
    assert.deepStrictEqual(tags, []);
  });

  it('getTagsByList handles malformed tags JSON gracefully', async () => {
    const d = await db.getDb();
    await d.execute({
      sql: "INSERT INTO movies (list_id, title, tags) VALUES (?, 'BadTags', 'not-json')",
      args: [listId],
    });
    const tags = await db.getTagsByList(listId);
    assert.ok(Array.isArray(tags));
  });
});

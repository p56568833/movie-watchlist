// Database unit tests — uses Node 22 built-in test runner
// Run: node --test test/db.test.js

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'moviedb-unit-'));
const DB_PATH = path.join(tmpDir, 'test.db');
process.env.DB_PATH = DB_PATH;

const db = require('../db');

after(() => {
  db.flushDb();
  db.resetDb();
  try { fs.rmSync(tmpDir, { recursive: true }); } catch { /* ok */ }
});

// ═══════════════════════════════════════════════════════
// Schema & migration
// ═══════════════════════════════════════════════════════

describe('Schema initialization', () => {
  it('creates default list on fresh DB', async () => {
    // Ensure clean slate
    db.resetDb();
    try { fs.unlinkSync(DB_PATH); } catch { /* ok */ }

    const lists = await db.getAllLists();
    assert.strictEqual(lists.length, 1);
    assert.strictEqual(lists[0].name, '我的片单');
    assert.strictEqual(lists[0].id, 1);
  });

  it('default list has expected shape', async () => {
    const list = await db.getListById(1);
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
    const list = await db.createList({ name: 'Test', description: undefined });
    assert.strictEqual(list.description, '');
  });

  it('updateList with partial fields preserves existing values', async () => {
    const list = await db.createList({ name: 'Original', description: 'Desc' });
    const updated = await db.updateList(list.id, { name: 'New' });
    assert.strictEqual(updated.name, 'New');
    assert.strictEqual(updated.description, 'Desc');
  });

  it('updateList returns null for non-existent list', async () => {
    const result = await db.updateList(99999, { name: 'x' });
    assert.strictEqual(result, null);
  });

  it('deleteList cascades movies', async () => {
    const list = await db.createList({ name: 'ToDelete' });
    await db.createMovie({ list_id: list.id, title: 'Movie in deleted list' });
    await db.createMovie({ list_id: list.id, title: 'Another' });

    // Should have movies
    const before = await db.getMoviesByList(list.id);
    assert.strictEqual(before.length, 2);

    // Delete the list (need a second list first so it's not the last)
    await db.createList({ name: 'Keep' });

    await db.deleteList(list.id);

    // Movies should be gone
    const movies = await db.getMoviesByList(list.id);
    assert.strictEqual(movies.length, 0);

    // The other list should be unaffected
    const keepList = await db.getListById(2);
    assert.ok(keepList);
  });
});

// ═══════════════════════════════════════════════════════
// Movies CRUD (edge cases)
// ═══════════════════════════════════════════════════════

describe('Movies CRUD edge cases', () => {
  it('getMovieById returns null for non-existent', async () => {
    const movie = await db.getMovieById(99999);
    assert.strictEqual(movie, null);
  });

  it('createMovie with all optional fields omitted uses defaults', async () => {
    const movie = await db.getMovieById(
      (await db.createMovie({ list_id: 1, title: 'Minimal' })).id
    );
    assert.strictEqual(movie.year, null);
    assert.strictEqual(movie.director, '');
    assert.strictEqual(movie.rating, 0);
    assert.strictEqual(movie.status, 'want_to_watch');
    assert.strictEqual(movie.notes, '');
    assert.strictEqual(movie.tags, '[]');
  });

  it('updateMovie preserves fields not in update payload', async () => {
    const { id } = await db.createMovie({
      list_id: 1, title: 'Full', year: 2020, director: 'Dir', rating: 3, status: 'watched',
    });

    // Update only title
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
    const m1 = await db.createMovie({ list_id: 1, title: 'Keep' });
    const m2 = await db.createMovie({ list_id: 1, title: 'Delete' });

    await db.deleteMovie(m2.id);

    const keep = await db.getMovieById(m1.id);
    assert.ok(keep);
    assert.strictEqual(keep.title, 'Keep');

    const deleted = await db.getMovieById(m2.id);
    assert.strictEqual(deleted, null);
  });

  it('getMoviesByList with tag filter matches tag substring in JSON', async () => {
    const list = await db.createList({ name: 'TagFilter' });
    await db.createMovie({ list_id: list.id, title: 'T1', tags: ['韩国', '剧情'] });
    await db.createMovie({ list_id: list.id, title: 'T2', tags: ['美国'] });

    const movies = await db.getMoviesByList(list.id, { tag: '韩国' });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, 'T1');
  });

  it('getMoviesByList sort by year desc', async () => {
    const list = await db.createList({ name: 'SortYear' });
    await db.createMovie({ list_id: list.id, title: 'Old', year: 1990 });
    await db.createMovie({ list_id: list.id, title: 'New', year: 2020 });

    const movies = await db.getMoviesByList(list.id, { sort: 'year' });
    assert.strictEqual(movies[0].title, 'New');
    assert.strictEqual(movies[1].title, 'Old');
  });

  it('getMoviesByList sort by rating desc', async () => {
    const list = await db.createList({ name: 'SortRating' });
    await db.createMovie({ list_id: list.id, title: 'Low', rating: 1 });
    await db.createMovie({ list_id: list.id, title: 'High', rating: 5 });

    const movies = await db.getMoviesByList(list.id, { sort: 'rating' });
    assert.strictEqual(movies[0].title, 'High');
    assert.strictEqual(movies[1].title, 'Low');
  });

  it('getMoviesByList search matches title and director', async () => {
    const list = await db.createList({ name: 'Search' });
    await db.createMovie({ list_id: list.id, title: '寄生虫', director: '奉俊昊' });
    await db.createMovie({ list_id: list.id, title: '蝙蝠', director: '朴赞郁' });

    // Search in title
    let movies = await db.getMoviesByList(list.id, { search: '寄生' });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].title, '寄生虫');

    // Search in director
    movies = await db.getMoviesByList(list.id, { search: '奉俊昊' });
    assert.strictEqual(movies.length, 1);
    assert.strictEqual(movies[0].director, '奉俊昊');
  });
});

// ═══════════════════════════════════════════════════════
// Tags
// ═══════════════════════════════════════════════════════

describe('Tags', () => {
  it('getTagsByList returns deduplicated sorted tags', async () => {
    const list = await db.createList({ name: 'TagTest' });
    await db.createMovie({ list_id: list.id, title: 'M1', tags: ['韩国', '剧情'] });
    await db.createMovie({ list_id: list.id, title: 'M2', tags: ['韩国', '动作'] });

    const tags = await db.getTagsByList(list.id);
    assert.deepStrictEqual(tags, ['剧情', '动作', '韩国']);
  });

  it('getTagsByList returns empty array for list with no movies', async () => {
    const list = await db.createList({ name: 'Empty' });
    const tags = await db.getTagsByList(list.id);
    assert.deepStrictEqual(tags, []);
  });

  it('getTagsByList handles malformed tags JSON gracefully', async () => {
    // Simulate a movie with non-array tags stored as a plain string
    const d = await db.getDb();
    d.run(`INSERT INTO movies (list_id, title, tags) VALUES (1, 'BadTags', 'not-json')`);
    db.flushDb();

    const tags = await db.getTagsByList(1);
    assert.ok(Array.isArray(tags));
    // 'not-json' string wouldn't be parsed as array, so it adds nothing
  });
});

#!/usr/bin/env node
/**
 * 本地 movies.db → Turso 云端数据迁移
 *
 * 使用方式：
 *   TURSO_URL=libsql://... TURSO_AUTH_TOKEN=... node scripts/migrate-to-turso.js
 *
 * 可选参数：
 *   LOCAL_DB=./movies.db   (默认 ./movies.db)
 *   TURSO_URL              (必填 — Turso 数据库地址)
 *   TURSO_AUTH_TOKEN       (必填 — Turso 认证 token)
 */

const { createClient } = require('@libsql/client');

const LOCAL_DB = process.env.LOCAL_DB || 'movies.db';
const TURSO_URL = process.env.TURSO_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_TOKEN) {
  console.error('❌ 请设置环境变量:');
  console.error('   TURSO_URL=libsql://your-db.turso.io');
  console.error('   TURSO_AUTH_TOKEN=your-token');
  process.exit(1);
}

const local = createClient({ url: `file:${LOCAL_DB}` });
const turso = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

async function migrate() {
  console.log('📦 读取本地数据库…');
  const lists = await local.execute('SELECT * FROM lists ORDER BY id ASC');
  const movies = await local.execute('SELECT * FROM movies ORDER BY id ASC');
  console.log(`   列表: ${lists.rows.length} 条, 电影: ${movies.rows.length} 条`);

  console.log('🏗️  在 Turso 上创建表结构…');
  await turso.execute(`
    CREATE TABLE IF NOT EXISTS lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  await turso.execute(`
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

  // Check if Turso already has data
  const existing = await turso.execute('SELECT COUNT(*) as c FROM lists');
  if (existing.rows[0].c > 0) {
    console.log('⚠️  Turso 已有数据，迁移需要在空数据库上运行');
    console.log('   如需覆盖请先清空 Turso 数据库');
    process.exit(1);
  }

  console.log('📤 迁移列表…');
  for (const list of lists.rows) {
    await turso.execute({
      sql: 'INSERT INTO lists (id, name, description, created_at) VALUES (?, ?, ?, ?)',
      args: [list.id, list.name, list.description, list.created_at],
    });
  }
  console.log(`   ✅ ${lists.rows.length} 个列表`);

  console.log('📤 迁移电影…');
  let count = 0;
  for (const movie of movies.rows) {
    await turso.execute({
      sql: `INSERT INTO movies (id, list_id, title, year, director, poster_url, poster_path, tmdb_id, rating, status, notes, tags, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        movie.id, movie.list_id, movie.title, movie.year,
        movie.director, movie.poster_url, movie.poster_path,
        movie.tmdb_id, movie.rating, movie.status, movie.notes,
        movie.tags, movie.created_at,
      ],
    });
    count++;
  }
  console.log(`   ✅ ${count} 部电影`);

  console.log('\n🎉 迁移完成！现在可以设置 TURSO_URL / TURSO_AUTH_TOKEN 并启动应用');
}

migrate().catch((err) => {
  console.error('❌ 迁移失败:', err.message);
  process.exit(1);
});

// Frontend unit tests — uses Node 22 built-in test runner
// Tests pure logic modules: detailStack, utils (esc/posterUrl), state
// Run: node --test test/frontend.test.js

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

// ── Mocks (set before dynamic imports) ────────────────

// Mock document for esc()
globalThis.document = {
  createElement() {
    return {
      set textContent(_) {},
      get innerHTML() { return this._inner || ''; },
      set innerHTML(v) { this._inner = v; },
      _inner: '',
    };
  },
};

// We need to patch createElement to actually work like a real one
const origCreateElement = globalThis.document.createElement.bind(globalThis.document);

// Mock localStorage for state.js
const store = new Map();
globalThis.localStorage = {
  getItem(key) { return store.get(key) ?? null; },
  setItem(key, value) { store.set(key, value); },
};

// ── Dynamic imports ───────────────────────────────────

let detailStack, esc, posterUrl, backdropUrl;
let getState, setState, updateState, resetFilters, setTmdbKey;

before(async () => {
  // Patch createElement to properly handle textContent → innerHTML
  globalThis.document.createElement = (tag) => {
    const el = {
      _text: '',
      set textContent(v) { el._text = String(v ?? ''); },
      get innerHTML() {
        // Simple HTML escaping
        return el._text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      },
    };
    return el;
  };

  detailStack = await import('../public/js/detailStack.js');
  const utils = await import('../public/js/utils.js');
  esc = utils.esc;
  posterUrl = utils.posterUrl;
  backdropUrl = utils.backdropUrl;

  const stateMod = await import('../public/js/state.js');
  getState = stateMod.getState;
  setState = stateMod.setState;
  updateState = stateMod.updateState;
  resetFilters = stateMod.resetFilters;
  setTmdbKey = stateMod.setTmdbKey;
});

// ═══════════════════════════════════════════════════════
// detailStack
// ═══════════════════════════════════════════════════════

describe('detailStack', () => {
  it('starts empty', () => {
    detailStack.clearStack();
    assert.strictEqual(detailStack.canGoBack(), false);
    assert.strictEqual(detailStack.peek(), null);
  });

  it('push adds entry and canGoBack returns true', () => {
    detailStack.clearStack();
    detailStack.push({ type: 'movie', movie: { id: 1, title: 'Test' } });
    assert.strictEqual(detailStack.canGoBack(), true);
    assert.deepStrictEqual(detailStack.peek(), { type: 'movie', movie: { id: 1, title: 'Test' } });
  });

  it('pop returns last pushed entry', () => {
    detailStack.clearStack();
    detailStack.push({ type: 'person', id: 100, name: 'Director' });
    detailStack.push({ type: 'movie', movie: { id: 2 } });

    const popped = detailStack.pop();
    assert.deepStrictEqual(popped, { type: 'movie', movie: { id: 2 } });
    assert.strictEqual(detailStack.canGoBack(), true);
    assert.deepStrictEqual(detailStack.peek(), { type: 'person', id: 100, name: 'Director' });
  });

  it('pop returns null when stack is empty', () => {
    detailStack.clearStack();
    assert.strictEqual(detailStack.pop(), null);
    assert.strictEqual(detailStack.canGoBack(), false);
  });

  it('clearStack empties the stack', () => {
    detailStack.push({ type: 'movie', movie: { id: 1 } });
    detailStack.push({ type: 'person', id: 2 });
    assert.strictEqual(detailStack.canGoBack(), true);

    detailStack.clearStack();
    assert.strictEqual(detailStack.canGoBack(), false);
    assert.strictEqual(detailStack.peek(), null);
    assert.strictEqual(detailStack.pop(), null);
  });

  it('peek returns top without removing', () => {
    detailStack.clearStack();
    detailStack.push({ type: 'a' });
    detailStack.push({ type: 'b' });

    assert.deepStrictEqual(detailStack.peek(), { type: 'b' });
    assert.strictEqual(detailStack.canGoBack(), true);
    // peek again — should still be there
    assert.deepStrictEqual(detailStack.peek(), { type: 'b' });
  });

  it('multiple pop until empty', () => {
    detailStack.clearStack();
    detailStack.push({ type: 'first' });
    detailStack.push({ type: 'second' });
    detailStack.push({ type: 'third' });

    assert.deepStrictEqual(detailStack.pop(), { type: 'third' });
    assert.deepStrictEqual(detailStack.pop(), { type: 'second' });
    assert.deepStrictEqual(detailStack.pop(), { type: 'first' });
    assert.strictEqual(detailStack.pop(), null);
    assert.strictEqual(detailStack.canGoBack(), false);
  });
});

// ═══════════════════════════════════════════════════════
// utils — esc()
// ═══════════════════════════════════════════════════════

describe('esc', () => {
  it('escapes HTML special characters', () => {
    assert.strictEqual(esc('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('returns empty string for null/undefined', () => {
    assert.strictEqual(esc(null), '');
    assert.strictEqual(esc(undefined), '');
  });

  it('returns string for numbers', () => {
    assert.strictEqual(esc(0), '0');
    assert.strictEqual(esc(2024), '2024');
  });

  it('passes through safe text unchanged', () => {
    assert.strictEqual(esc('寄生虫'), '寄生虫');
    assert.strictEqual(esc('奉俊昊'), '奉俊昊');
    assert.strictEqual(esc('Hello World'), 'Hello World');
  });

  it('escapes ampersand', () => {
    assert.strictEqual(esc('A & B'), 'A &amp; B');
  });

  it('escapes single quotes', () => {
    assert.strictEqual(esc("it's"), "it&#39;s");
  });
});

// ═══════════════════════════════════════════════════════
// utils — posterUrl / backdropUrl
// ═══════════════════════════════════════════════════════

describe('posterUrl', () => {
  it('uses poster_path when available', () => {
    const url = posterUrl({ poster_path: '/abc.jpg' });
    assert.ok(url.includes('image.tmdb.org'));
    assert.ok(url.endsWith('/abc.jpg'));
  });

  it('falls back to poster_url', () => {
    const url = posterUrl({ poster_url: 'https://example.com/img.jpg' });
    assert.strictEqual(url, 'https://example.com/img.jpg');
  });

  it('prefers poster_path over poster_url', () => {
    const url = posterUrl({ poster_path: '/tmdb.jpg', poster_url: 'https://example.com/img.jpg' });
    assert.ok(url.includes('image.tmdb.org'));
    assert.ok(url.endsWith('/tmdb.jpg'));
  });

  it('returns null when both missing', () => {
    assert.strictEqual(posterUrl({}), null);
  });
});

describe('backdropUrl', () => {
  it('returns backdrop URL with base path', () => {
    const url = backdropUrl({ backdrop_path: '/bg.jpg' });
    assert.ok(url.includes('image.tmdb.org'));
    assert.ok(url.endsWith('/bg.jpg'));
  });

  it('returns null when backdrop_path missing', () => {
    assert.strictEqual(backdropUrl({}), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(backdropUrl(null), null);
  });
});

// ═══════════════════════════════════════════════════════
// state
// ═══════════════════════════════════════════════════════

describe('state', () => {
  it('getState returns an object with expected keys', () => {
    const state = getState();
    assert.ok(Array.isArray(state.lists));
    assert.ok(Array.isArray(state.movies));
    assert.ok(Array.isArray(state.allTags));
    assert.ok(Array.isArray(state.formTags));
    assert.ok(state.existingTmdbIds instanceof Set);
    assert.ok(typeof state.tmdbKey === 'string');
    assert.ok('filters' in state);
    assert.ok('editingId' in state);
    assert.ok('currentListId' in state);
  });

  it('setState merges properties', () => {
    const before = getState();
    setState({ currentListId: 99 });
    assert.strictEqual(getState().currentListId, 99);
    // Reset
    setState({ currentListId: before.currentListId });
  });

  it('updateState receives the state object', () => {
    let captured = null;
    updateState((draft) => {
      captured = draft;
      draft._testKey = 'test-value';
    });
    assert.strictEqual(captured._testKey, 'test-value');
    assert.strictEqual(getState()._testKey, 'test-value');
    // Clean up
    delete getState()._testKey;
  });

  it('resetFilters restores default filters', () => {
    updateState((draft) => {
      draft.filters = { listSearch: 'hello', tag: 'action', sort: 'year' };
    });
    assert.strictEqual(getState().filters.listSearch, 'hello');

    const filters = resetFilters();
    assert.strictEqual(filters.listSearch, '');
    assert.strictEqual(filters.tag, null);
    assert.strictEqual(filters.sort, 'created_at');
  });

  it('setTmdbKey updates state and localStorage', () => {
    setTmdbKey('test-api-key-123');
    assert.strictEqual(getState().tmdbKey, 'test-api-key-123');
    assert.strictEqual(globalThis.localStorage.getItem('tmdb_api_key'), 'test-api-key-123');
  });
});

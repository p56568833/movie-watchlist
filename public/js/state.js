import { createDefaultFilters } from './constants.js';

const state = {
  lists: [],
  currentListId: null,
  movies: [],
  allTags: [],
  filters: createDefaultFilters(),
  editingId: null,
  formTags: [],
  existingTmdbIds: new Set(),
  tmdbKey: localStorage.getItem('tmdb_api_key') || '',
};

const listeners = {};

/**
 * 订阅 state 顶层 key 的变化
 * @param {string} key
 * @param {(newVal, state) => void} fn
 * @returns {() => void} 取消订阅
 */
export function on(key, fn) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(fn);
  return () => {
    listeners[key] = listeners[key].filter(f => f !== fn);
  };
}

function emit(key) {
  const fns = listeners[key];
  if (fns) fns.forEach(fn => fn(state[key], state));
}

export function getState() {
  return state;
}

export function setState(patch) {
  const prev = snapshot();
  Object.assign(state, patch);
  notifyChanged(prev);
  return state;
}

export function updateState(updater) {
  const prev = snapshot();
  updater(state);
  notifyChanged(prev);
  return state;
}

export function resetFilters() {
  const prev = state.filters;
  state.filters = createDefaultFilters();
  if (state.filters !== prev) emit('filters');
  return state.filters;
}

export function setTmdbKey(key) {
  state.tmdbKey = key;
  localStorage.setItem('tmdb_api_key', key);
  emit('tmdbKey');
}

// ── internal ──────────────────────────────────────────

function snapshot() {
  return {
    currentListId: state.currentListId,
    lists: state.lists,
    movies: state.movies,
    tmdbKey: state.tmdbKey,
    filters: state.filters,
  };
}

function notifyChanged(prev) {
  for (const key of Object.keys(prev)) {
    if (state[key] !== prev[key]) emit(key);
  }
}

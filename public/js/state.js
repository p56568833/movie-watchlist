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

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  return state;
}

export function updateState(updater) {
  updater(state);
  return state;
}

export function resetFilters() {
  state.filters = createDefaultFilters();
  return state.filters;
}

export function setTmdbKey(key) {
  state.tmdbKey = key;
  localStorage.setItem('tmdb_api_key', key);
}

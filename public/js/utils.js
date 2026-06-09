import { TMDB_POSTER_BASE, TMDB_BACKDROP_BASE } from './constants.js';

export function posterUrl(movie) {
  if (movie.poster_path) return TMDB_POSTER_BASE + movie.poster_path;
  if (movie.poster_url) return movie.poster_url;
  return null;
}

export function backdropUrl(tmdb) {
  if (tmdb?.backdrop_path) return TMDB_BACKDROP_BASE + tmdb.backdrop_path;
  return null;
}

export function esc(value) {
  const el = document.createElement('div');
  el.textContent = value ?? '';
  return el.innerHTML;
}

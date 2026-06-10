import { getTMDBBase } from './constants.js';
import { getState } from './state.js';

/** 共享电影缓存：tmdbId → { title, year, poster_path, overview, vote_average, genres } */
const movieCache = new Map();

export function getCachedMovie(tmdbId) {
  return movieCache.get(tmdbId) || null;
}

/** 缓存 TMDB 搜索结果中的电影基本信息 */
export function cacheMovieResult(movie) {
  if (!movieCache.has(movie.id)) {
    movieCache.set(movie.id, {
      title: movie.title,
      year: movie.release_date ? movie.release_date.slice(0, 4) : '',
      poster_path: movie.poster_path || '',
      overview: movie.overview || '',
      vote_average: movie.vote_average || 0,
      genres: null,
    });
  }
}

async function fetchMovieDetails(tmdbId, appendToResponse = '') {
  const state = getState();
  if (!state.tmdbKey) throw new Error('No TMDB key');

  let url = `${getTMDBBase()}/movie/${tmdbId}?api_key=${state.tmdbKey}&language=zh-CN`;
  if (appendToResponse) url += `&append_to_response=${appendToResponse}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB fetch failed');
  return res.json();
}

/** 获取电影类型标签（带缓存） */
export async function fetchTMDBGenres(tmdbId) {
  const cached = movieCache.get(tmdbId);
  if (cached?.genres) return cached.genres;

  try {
    const details = await fetchMovieDetails(tmdbId);
    const genres = (details.genres || []).map(g => g.name);
    movieCache.set(tmdbId, { ...movieCache.get(tmdbId), ...makeCacheEntry(details), genres });
    return genres;
  } catch {
    return [];
  }
}

/** 获取电影详情 + 演职员（带缓存） */
export async function fetchTMDBMovieWithCredits(tmdbId) {
  const details = await fetchMovieDetails(tmdbId, 'credits');
  movieCache.set(tmdbId, { ...movieCache.get(tmdbId), ...makeCacheEntry(details) });
  return details;
}

function makeCacheEntry(details) {
  return {
    title: details.title,
    year: details.release_date ? details.release_date.slice(0, 4) : '',
    poster_path: details.poster_path || '',
    overview: details.overview || '',
    vote_average: details.vote_average || 0,
    genres: (details.genres || []).map(g => g.name),
    tagline: details.tagline || '',
  };
}

/** 获取电影标语（优先读缓存，无缓存则拉 TMDB） */
export async function getTagline(tmdbId) {
  const cached = movieCache.get(tmdbId);
  if (cached?.tagline !== undefined && cached.tagline !== null) return cached.tagline;

  try {
    const details = await fetchMovieDetails(tmdbId);
    const tagline = details.tagline || '';
    movieCache.set(tmdbId, { ...movieCache.get(tmdbId), ...makeCacheEntry(details) });
    return tagline;
  } catch {
    return '';
  }
}

/** 获取相似电影推荐 */
export async function fetchSimilarMovies(tmdbId) {
  const state = getState();
  if (!state.tmdbKey) return [];

  try {
    const url = `${getTMDBBase()}/movie/${tmdbId}/recommendations?api_key=${state.tmdbKey}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const movies = (data.results || []).slice(0, 12);
    movies.forEach(m => cacheMovieResult(m));
    return movies;
  } catch {
    return [];
  }
}

/** 获取 TMDB 流行榜 */
export async function fetchPopularMovies() {
  const state = getState();
  if (!state.tmdbKey) return [];

  try {
    const url = `${getTMDBBase()}/movie/popular?api_key=${state.tmdbKey}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const movies = (data.results || []).slice(0, 20);
    movies.forEach(m => cacheMovieResult(m));
    return movies;
  } catch {
    return [];
  }
}

/** 获取系列电影列表（按上映日期排序） */
export async function fetchCollection(collectionId) {
  const state = getState();
  if (!state.tmdbKey) return [];

  try {
    const url = `${getTMDBBase()}/collection/${collectionId}?api_key=${state.tmdbKey}&language=zh-CN`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const movies = (data.parts || []).sort((a, b) =>
      (a.release_date || '').localeCompare(b.release_date || '')
    );
    movies.forEach(m => cacheMovieResult(m));
    return { name: data.name, overview: data.overview, movies };
  } catch {
    return { name: '', overview: '', movies: [] };
  }
}

/** 获取 TMDB 正在热映 */
export async function fetchNowPlaying() {
  const state = getState();
  if (!state.tmdbKey) return [];

  try {
    const url = `${getTMDBBase()}/movie/now_playing?api_key=${state.tmdbKey}&language=zh-CN&region=CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const movies = (data.results || []).slice(0, 20);
    movies.forEach(m => cacheMovieResult(m));
    return movies;
  } catch {
    return [];
  }
}

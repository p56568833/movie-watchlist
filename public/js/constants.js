export const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
export const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
export const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
export const TMDB_SEARCH_URL = 'https://api.themoviedb.org/3/search/movie';
export const TMDB_PERSON_SEARCH_URL = 'https://api.themoviedb.org/3/search/person';

export function createDefaultFilters() {
  return {
    listSearch: '',
    tag: null,
    sort: 'created_at',
  };
}

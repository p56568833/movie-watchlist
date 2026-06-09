export const TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w500';
export const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/w1280';
export const TMDB_PROFILE_BASE = 'https://image.tmdb.org/t/p/w185';
export const TMDB_PROXY = '/api/tmdb';

export const DEPT_CN = {
  'Directing': '导演', 'Acting': '演员', 'Writing': '编剧',
  'Production': '制片', 'Editing': '剪辑', 'Camera': '摄影',
  'Sound': '音效', 'Art': '美术', 'Costume & Make-Up': '服化道',
  'Crew': '幕后', 'Visual Effects': '视效', 'Lighting': '灯光',
};

export function createDefaultFilters() {
  return {
    listSearch: '',
    tag: null,
    sort: 'created_at',
  };
}

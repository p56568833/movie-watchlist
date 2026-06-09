import { $ } from './dom.js';
import { getState, updateState } from './state.js';
import { esc } from './utils.js';
import { TMDB_POSTER_BASE, TMDB_PROFILE_BASE, DEPT_CN } from './constants.js';
import { api } from './api.js';
import { showToast } from './toast.js';
import { loadMovies } from './movies.js';
import { push, pop, canGoBack, clearStack } from './detailStack.js';

const TMDB_PROFILE_LARGE = 'https://image.tmdb.org/t/p/h632';

let currentPersonData = null;
const personMovieCache = new Map();

let _openMovieDetail = () => console.warn('[personDetail] setMovieDetailOpener 未被调用，电影跳转无效');
export function setMovieDetailOpener(fn) { _openMovieDetail = fn; }

export function openPersonDetail(person) {
  currentPersonData = person;
  $('#detailOverlay').classList.add('hidden');
  $('#personDetailOverlay').classList.remove('hidden');
  updateBackButton();
  $('#personPhoto').src = '';
  $('#personName').textContent = person.name;
  $('#personMeta').textContent = '';
  $('#personBio').textContent = '加载中...';
  $('#personFilmography').innerHTML = '';
  loadPersonDetail(person.id);
}

export function closePersonDetail() {
  $('#personDetailOverlay').classList.add('hidden');
  clearStack();
  currentPersonData = null;
}

export function initPersonDetail() {
  $('#personDetailClose').addEventListener('click', closePersonDetail);
  $('#personDetailBack').addEventListener('click', goBack);
  $('#personDetailOverlay').addEventListener('click', (e) => {
    if (e.target === $('#personDetailOverlay')) closePersonDetail();
  });

  // Bio expand/collapse
  $('#personBioToggle').addEventListener('click', () => {
    const $bio = $('#personBio');
    const $btn = $('#personBioToggle');
    const $fade = $('#personBioFade');
    if ($bio.classList.contains('collapsed')) {
      $bio.classList.remove('collapsed');
      $btn.textContent = '收起 ↑';
      $fade.classList.add('hidden');
    } else {
      $bio.classList.add('collapsed');
      $btn.textContent = '展开 ↓';
      $fade.classList.remove('hidden');
    }
  });
}

function goBack() {
  const prev = pop();
  if (!prev) { closePersonDetail(); return; }

  $('#personDetailOverlay').classList.add('hidden');
  currentPersonData = null;

  if (prev.type === 'movie') {
    if (_openMovieDetail) _openMovieDetail(prev.movie);
  } else if (prev.type === 'person') {
    openPersonDetail({ id: prev.id, name: prev.name });
  }
}

function updateBackButton() {
  const btn = $('#personDetailBack');
  canGoBack() ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

async function loadPersonDetail(personId) {
  const state = getState();
  const key = state.tmdbKey;
  if (!key) return;

  try {
    const [details, credits] = await Promise.all([
      fetch(`https://api.themoviedb.org/3/person/${personId}?api_key=${key}&language=zh-CN`).then(r => r.json()),
      fetch(`https://api.themoviedb.org/3/person/${personId}/movie_credits?api_key=${key}&language=zh-CN`).then(r => r.json()),
    ]);
    renderPersonDetails(details);
    renderFilmography(credits);
  } catch {
    $('#personBio').textContent = '加载失败';
  }
}

function renderPersonDetails(details) {
  if (details.profile_path) {
    $('#personPhoto').src = TMDB_PROFILE_LARGE + details.profile_path;
  }

  // Role tags
  const roles = [];
  if (details.known_for_department) {
    roles.push(DEPT_CN[details.known_for_department] || details.known_for_department);
  }
  if (details.also_known_as?.length && roles.length === 0) {
    roles.push('影人');
  }
  if (roles.length > 0) {
    $('#personRoles').innerHTML = roles.map(r => `<span class="person-role-tag">${esc(r)}</span>`).join('');
    $('#personRoles').classList.remove('hidden');
  } else {
    $('#personRoles').classList.add('hidden');
  }

  const metaParts = [];
  if (details.birthday) metaParts.push(details.birthday);
  if (details.deathday) metaParts.push(`— ${details.deathday}`);
  if (details.place_of_birth) metaParts.push(details.place_of_birth);
  $('#personMeta').textContent = metaParts.join(' · ');

  const bio = details.biography || '暂无简介';
  const $bio = $('#personBio');
  $bio.textContent = bio;
  $bio.classList.add('collapsed');

  requestAnimationFrame(() => {
    if ($bio.scrollHeight > $bio.clientHeight + 4) {
      $('#personBioFade').classList.remove('hidden');
      $('#personBioToggle').classList.remove('hidden');
    } else {
      $('#personBioFade').classList.add('hidden');
      $('#personBioToggle').classList.add('hidden');
      $bio.classList.remove('collapsed');
    }
  });
}

function renderFilmography(credits) {
  const container = $('#personFilmography');
  const state = getState();

  const directed = new Map();
  const wrote = new Map();
  const acted = new Map();

  const cacheMovie = (m) => {
    personMovieCache.set(m.id, {
      title: m.title || '',
      year: m.release_date ? m.release_date.slice(0, 4) : '',
      poster_path: m.poster_path || '',
      overview: m.overview || '',
    });
  };

  for (const c of credits.crew || []) {
    if (c.job === 'Director' && c.id) { directed.set(c.id, { ...c, title: c.title || '', _roles: ['导演'] }); cacheMovie(c); }
  }
  for (const c of credits.crew || []) {
    if (c.department === 'Writing' && c.job !== 'Director' && c.id && !directed.has(c.id)) {
      if (!wrote.has(c.id)) { wrote.set(c.id, { ...c, title: c.title || '', _roles: ['编剧'] }); cacheMovie(c); }
    }
  }
  for (const c of credits.cast || []) {
    if (c.id && !directed.has(c.id) && !wrote.has(c.id)) {
      acted.set(c.id, { ...c, title: c.title || '', _roles: ['演员'] }); cacheMovie(c);
    }
  }

  const popularSort = (a, b) => (b.popularity || 0) - (a.popularity || 0) || (b.release_date || '').localeCompare(a.release_date || '');

  // Weighted popularity for cast: lead roles get 1.5×, minor/extra get 0.6×
  const weightedSort = (a, b) => {
    const w = (o) => o <= 2 ? 1.5 : o <= 5 ? 1.0 : 0.6;
    const scoreA = (a.popularity || 0) * w(a.order ?? 99);
    const scoreB = (b.popularity || 0) * w(b.order ?? 99);
    return scoreB - scoreA || (b.release_date || '').localeCompare(a.release_date || '');
  };

  const sections = [];
  if (directed.size > 0) sections.push({ title: '导演作品', movies: [...directed.values()].sort(popularSort) });
  if (wrote.size > 0) sections.push({ title: '编剧作品', movies: [...wrote.values()].sort(popularSort) });
  if (acted.size > 0) sections.push({ title: '参演作品', movies: [...acted.values()].sort(weightedSort) });

  if (sections.length === 0) {
    container.innerHTML = '<p class="person-no-movies">暂无作品信息</p>';
    return;
  }

  container.innerHTML = sections.map(section => {
    const items = section.movies.map(m => renderMovieItem(m, state)).join('');
    return `<div class="person-filmography-section"><h3 class="person-section-title">${section.title} <span class="person-section-count">${section.movies.length}</span></h3><div class="person-movie-list">${items}</div></div>`;
  }).join('');

  container.onclick = async (e) => {
    const btn = e.target.closest('[data-action="add-person-movie"]');
    if (btn && !btn.classList.contains('added')) { e.stopPropagation(); await addPersonMovie(btn); return; }

    const item = e.target.closest('.person-movie-item');
    if (item && _openMovieDetail) {
      const tmdbId = Number(item.dataset.tmdbId);
      const cached = personMovieCache.get(tmdbId);
      if (cached) {
        push({ type: 'person', id: currentPersonData.id, name: currentPersonData.name });
        _openMovieDetail({ tmdb_id: tmdbId, title: cached.title, year: cached.year, poster_path: cached.poster_path });
      }
    }
  };
}

function renderMovieItem(m, state) {
  const title = m.title || '未知';
  const year = m.release_date ? m.release_date.slice(0, 4) : '';
  const posterHtml = m.poster_path
    ? `<img class="person-movie-poster" src="${TMDB_POSTER_BASE}${m.poster_path}" alt="" loading="lazy">`
    : '<div class="person-movie-noposter">🎬</div>';
  const alreadyAdded = state.existingTmdbIds.has(m.id);

  // Subtitle: rating if available, else character name, else overview
  let subHtml = '';
  if (m.vote_average > 0) {
    subHtml = `<span class="star">★</span> ${m.vote_average.toFixed(1)}`;
  } else if (m.character) {
    subHtml = `饰 ${esc(m.character)}`;
  } else if (m.overview) {
    subHtml = esc(m.overview.slice(0, 60));
  }

  return `
    <div class="person-movie-item" data-tmdb-id="${m.id}">
      ${posterHtml}
      <div class="person-movie-info">
        <span class="person-movie-title">${esc(title)}${year ? `<span class="person-movie-year">${year}</span>` : ''}</span>
        ${subHtml ? `<span class="person-movie-sub">${subHtml}</span>` : ''}
      </div>
      <button class="${alreadyAdded ? 'tmdb-add-btn added' : 'tmdb-add-btn'}" data-action="add-person-movie" ${alreadyAdded ? 'disabled' : ''}>${alreadyAdded ? '✓ 已收藏' : '+ 添加'}</button>
    </div>`;
}

async function addPersonMovie(btn) {
  const item = btn.closest('.person-movie-item');
  const tmdbId = Number(item.dataset.tmdbId);
  const cached = personMovieCache.get(tmdbId);
  if (!cached) return;
  btn.textContent = '添加中...'; btn.disabled = true;
  try {
    let genres = [];
    const state = getState();
    if (state.tmdbKey) {
      const gRes = await fetch(`https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${state.tmdbKey}&language=zh-CN`);
      if (gRes.ok) { const details = await gRes.json(); genres = (details.genres || []).map(g => g.name); }
    }
    await api(`/api/lists/${state.currentListId}/movies`, {
      method: 'POST',
      body: JSON.stringify({ title: cached.title, year: cached.year ? Number(cached.year) : null, poster_path: cached.poster_path, tmdb_id: tmdbId, rating: 0, status: 'watched', tags: genres, notes: cached.overview || '' }),
    });
    showToast(`已添加《${cached.title}》`);
    btn.classList.add('added'); btn.textContent = '✓ 已收藏'; btn.disabled = true;
    updateState((draft) => { draft.existingTmdbIds.add(tmdbId); });
    await loadMovies();
  } catch (err) {
    showToast(err.message || '添加失败', true);
    btn.textContent = '+ 添加'; btn.disabled = false;
  }
}

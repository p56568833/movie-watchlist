import { api } from './api.js';
import { TMDB_POSTER_BASE, TMDB_PROFILE_BASE, TMDB_PROXY, DEPT_CN } from './constants.js';
import { $ } from './dom.js';
import { getState, updateState } from './state.js';
import { showToast } from './toast.js';
import { esc } from './utils.js';
import { loadMovies } from './movies.js';
import { openSettings } from './settings.js';
import { openPersonDetail } from './personDetail.js';
import { openDetail } from './detailPanel.js';

let tmdbTimer;
const tmdbSearchCache = new Map();
let lastPersons = [];

export function initTMDBSearch() {
  const state = getState();
  if (!state.tmdbKey) $('#tmdbHint').classList.remove('hidden');

  $('#tmdbSearch').addEventListener('input', handleSearchInput);
  $('#tmdbSearch').addEventListener('focus', showCachedDropdown);
  $('#tmdbDropdown').addEventListener('click', handleDropdownClick);

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#tmdbSearchWrap') && !event.target.closest('#tmdbDropdown')) {
      closeDropdown();
    }
  });
}

export function closeDropdown() {
  $('#tmdbDropdown').classList.remove('active');
  $('#tmdbDropdown').innerHTML = '';
}

export function openTMDBSettings() {
  closeDropdown();
  openSettings();
}

function handleSearchInput() {
  clearTimeout(tmdbTimer);

  const query = $('#tmdbSearch').value.trim();
  const state = getState();
  if (!query) {
    closeDropdown();
    return;
  }

  if (!state.tmdbKey) {
    $('#tmdbHint').classList.remove('hidden');
    $('#tmdbDropdown').classList.remove('active');
    return;
  }

  $('#tmdbHint').classList.add('hidden');
  tmdbTimer = setTimeout(() => searchTMDB(query), 350);
}

function showCachedDropdown() {
  const query = $('#tmdbSearch').value.trim();
  const state = getState();
  if (query && state.tmdbKey && $('#tmdbDropdown').children.length > 0) {
    $('#tmdbDropdown').classList.add('active');
  }
}

async function searchTMDB(query) {
  if (query.length < 2) {
    closeDropdown();
    return;
  }

  const state = getState();
  const dropdown = $('#tmdbDropdown');

  try {
    const params = `api_key=${state.tmdbKey}&query=${encodeURIComponent(query)}&language=zh-CN&page=1`;
    const [movieRes, personRes] = await Promise.all([
      fetch(`${TMDB_PROXY}/search/movie?${params}`),
      fetch(`${TMDB_PROXY}/search/person?${params}`),
    ]);

    if (!movieRes.ok && !personRes.ok) {
      dropdown.innerHTML = movieRes.status === 401 || personRes.status === 401
        ? '<div class="tmdb-dropdown-error">API Key 无效，请检查设置</div>'
        : '<div class="tmdb-dropdown-error">搜索失败，请稍后重试</div>';
      dropdown.classList.add('active');
      return;
    }

    // Collect persons
    lastPersons = [];
    if (personRes.ok) {
      const personData = await personRes.json();
      lastPersons = (personData.results || []).slice(0, 3);
    }

    // Collect movies
    let movies = [];
    if (movieRes.ok) {
      const movieData = await movieRes.json();
      movies = (movieData.results || []).slice(0, 6);
      cacheTMDBResults(movies);
    }

    if (lastPersons.length === 0 && movies.length === 0) {
      dropdown.innerHTML = '<div class="tmdb-dropdown-empty">未找到匹配结果</div>';
      dropdown.classList.add('active');
      return;
    }

    renderDropdown(lastPersons, movies);
  } catch {
    dropdown.innerHTML = '<div class="tmdb-dropdown-error">网络错误</div>';
    dropdown.classList.add('active');
  }
}

function cacheTMDBResults(results) {
  results.forEach((movie) => {
    tmdbSearchCache.set(movie.id, {
      title: movie.title,
      year: movie.release_date ? movie.release_date.slice(0, 4) : '',
      poster_path: movie.poster_path || '',
      overview: movie.overview || '',
      vote_average: movie.vote_average || 0,
    });
  });
}

function renderDropdown(persons, movies) {
  const state = getState();
  const dropdown = $('#tmdbDropdown');
  let html = '';

  // Person section
  if (persons.length > 0) {
    html += '<div class="tmdb-dropdown-section-title">影人</div>';
    html += persons.map(p => {
      const avatarHtml = p.profile_path
        ? `<img class="tmdb-person-avatar" src="${TMDB_PROFILE_BASE}${p.profile_path}" alt="">`
        : '<div class="tmdb-person-avatar-placeholder">👤</div>';
      const dept = DEPT_CN[p.known_for_department] || p.known_for_department || '';
      return `
        <div class="tmdb-person-item" data-person-id="${p.id}">
          ${avatarHtml}
          <div class="tmdb-person-info">
            <span class="tmdb-person-name">${esc(p.name)}</span>
            ${dept ? `<span class="tmdb-person-dept">${esc(dept)}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Movie section
  if (movies.length > 0) {
    html += '<div class="tmdb-dropdown-section-title">电影</div>';
    html += movies.map((movie) => {
      const alreadyAdded = state.existingTmdbIds.has(movie.id);
      const posterHtml = movie.poster_path
        ? `<img class="tmdb-dropdown-poster" src="${TMDB_POSTER_BASE}${movie.poster_path}" alt="" loading="lazy">`
        : '<div class="tmdb-dropdown-noposter">🎬</div>';
      const year = movie.release_date ? movie.release_date.slice(0, 4) : '';
      const btnClass = alreadyAdded ? 'tmdb-add-btn added' : 'tmdb-add-btn';
      const btnText = alreadyAdded ? '✓ 已收藏' : '+ 添加';

      return `
        <div class="tmdb-dropdown-item" data-tmdb-id="${movie.id}">
          ${posterHtml}
          <div class="tmdb-dropdown-info">
            <span class="tmdb-dropdown-title">${esc(movie.title)}${year ? `<span class="tmdb-dropdown-year">${year}</span>` : ''}</span>
            <div class="tmdb-dropdown-overview">${esc((movie.overview || '').slice(0, 80))}</div>
          </div>
          <button class="${btnClass}" data-action="add" ${alreadyAdded ? 'disabled' : ''}>${btnText}</button>
        </div>
      `;
    }).join('');
  }

  dropdown.innerHTML = html;
  dropdown.classList.add('active');
}

function handleDropdownClick(event) {
  // Person card click
  const personItem = event.target.closest('.tmdb-person-item');
  if (personItem) {
    const personId = Number(personItem.dataset.personId);
    const person = lastPersons.find(p => p.id === personId);
    if (person) {
      closeDropdown();
      openPersonDetail(person);
    }
    return;
  }

  // Movie add button
  const addBtn = event.target.closest('[data-action="add"]');
  if (addBtn) {
    addMovieFromDropdown(event);
    return;
  }

  // Movie item click → open detail
  const movieItem = event.target.closest('.tmdb-dropdown-item');
  if (movieItem) {
    const tmdbId = Number(movieItem.dataset.tmdbId);
    const cached = tmdbSearchCache.get(tmdbId);
    if (cached) {
      closeDropdown();
      openDetail({ tmdb_id: tmdbId, title: cached.title, year: cached.year, poster_path: cached.poster_path });
    }
  }
}

async function addMovieFromDropdown(event) {
  const button = event.target.closest('[data-action="add"]');
  if (!button || button.classList.contains('added')) return;

  const item = button.closest('.tmdb-dropdown-item');
  if (!item) return;

  const tmdbId = Number(item.dataset.tmdbId);
  const cached = tmdbSearchCache.get(tmdbId);
  if (!cached) return;

  button.textContent = '添加中...';
  button.disabled = true;

  const genres = await fetchTMDBGenres(tmdbId);
  const state = getState();

  try {
    await api(`/api/lists/${state.currentListId}/movies`, {
      method: 'POST',
      body: JSON.stringify({
        title: cached.title,
        year: cached.year ? Number(cached.year) : null,
        poster_path: cached.poster_path,
        tmdb_id: tmdbId,
        rating: cached.vote_average || 0,
        status: 'watched',
        tags: genres,
        notes: cached.overview || '',
      }),
    });

    showToast(`已添加《${cached.title}》`);
    button.classList.add('added');
    button.textContent = '✓ 已收藏';
    updateState((draft) => { draft.existingTmdbIds.add(tmdbId); });
    await loadMovies();
  } catch (err) {
    showToast(err.message || '添加失败', true);
    button.textContent = '+ 添加';
    button.disabled = false;
  }
}

async function fetchTMDBGenres(tmdbId) {
  const state = getState();
  if (!state.tmdbKey) return [];

  try {
    const url = `${TMDB_PROXY}/movie/${tmdbId}?api_key=${state.tmdbKey}&language=zh-CN`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const details = await res.json();
    return (details.genres || []).map((genre) => genre.name);
  } catch {
    return [];
  }
}

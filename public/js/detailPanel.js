import { $ } from './dom.js';
import { getState } from './state.js';
import { posterUrl, backdropUrl, esc } from './utils.js';
import { TMDB_PROFILE_BASE } from './constants.js';
import { deleteMovie } from './movies.js';
import { push, pop, canGoBack, clearStack } from './detailStack.js';

let currentDetailMovie = null;
let _tmdbCredits = null;

let _openPersonDetail = () => console.warn('[detailPanel] setPersonDetailOpener 未被调用，导演/演员点击无效');
export function setPersonDetailOpener(fn) { _openPersonDetail = fn; }

export async function openDetail(movie) {
  currentDetailMovie = movie;
  _tmdbCredits = null;

  $('#personDetailOverlay').classList.add('hidden');
  $('#detailOverlay').classList.remove('hidden');
  $('#deleteConfirmOverlay').classList.add('hidden');
  updateBackButton();

  resetDetail(movie);
  renderLocalMovieDetails(movie);

  const state = getState();
  if (movie.tmdb_id && state.tmdbKey) {
    try {
      const tmdb = await fetchTMDBDetails(movie.tmdb_id, state.tmdbKey);
      _tmdbCredits = tmdb.credits;
      renderTMDBDetails(tmdb);
    } catch {
      $('#detailCast').innerHTML = '';
      $('#detailOverview').textContent = movie.notes || '暂无简介';
    }
  } else {
    $('#detailCast').innerHTML = '';
    $('#detailOverview').textContent = movie.notes || '暂无简介。可在编辑中添加备注。';
  }
}

export function closeDetail() {
  $('#detailOverlay').classList.add('hidden');
  $('#deleteConfirmOverlay').classList.add('hidden');
  clearStack();
  currentDetailMovie = null;
  _tmdbCredits = null;
}

export function initDetailPanel() {
  $('#detailClose').addEventListener('click', closeDetail);
  $('#detailBack').addEventListener('click', goBack);
  $('#detailOverlay').addEventListener('click', (event) => {
    if (event.target === $('#detailOverlay')) closeDetail();
  });

  $('#detailDeleteBtn').addEventListener('click', () => {
    if (!currentDetailMovie) return;
    $('#deleteConfirmText').innerHTML = `确定删除<strong>《${esc(currentDetailMovie.title)}》</strong>吗？`;
    $('#deleteConfirmOverlay').classList.remove('hidden');
  });

  $('#deleteConfirmCancel').addEventListener('click', () => {
    $('#deleteConfirmOverlay').classList.add('hidden');
  });

  $('#deleteConfirmBtn').addEventListener('click', async () => {
    if (!currentDetailMovie) return;
    await deleteMovie(currentDetailMovie.id);
    $('#deleteConfirmOverlay').classList.add('hidden');
    closeDetail();
  });
}

function goBack() {
  const prev = pop();
  if (!prev) { closeDetail(); return; }

  $('#detailOverlay').classList.add('hidden');
  currentDetailMovie = null;
  _tmdbCredits = null;

  if (prev.type === 'person') {
    if (_openPersonDetail) _openPersonDetail({ id: prev.id, name: prev.name });
  } else if (prev.type === 'movie') {
    openDetail(prev.movie);
  }
}

function updateBackButton() {
  const btn = $('#detailBack');
  canGoBack() ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

function resetDetail(movie) {
  $('#detailBackdrop').src = '';
  $('#detailBackdrop').classList.add('hidden');
  $('#detailBannerPlaceholder').classList.add('hidden');
  $('#detailBanner').classList.remove('has-backdrop');
  $('#detailTitle').textContent = movie.title;
  $('#detailYear').textContent = movie.year || '';
  $('#detailRuntime').textContent = '';
  $('#detailGenres').textContent = '';
  $('#detailTmdbRating').classList.add('hidden');
  $('#detailTmdbRating').innerHTML = '';
  $('#detailOverview').textContent = '加载中...';
  $('#detailCast').innerHTML = '<span class="detail-loading">加载中...</span>';
  $('#detailDirector').innerHTML = '';
  $('#detailTagsRow').classList.add('hidden');
  $('#detailNotesRow').classList.add('hidden');
}

function renderLocalMovieDetails(movie) {
  $('#detailBannerPlaceholder').classList.remove('hidden');
  const tags = Array.isArray(movie.tags) ? movie.tags : [];
  if (tags.length > 0) {
    $('#detailTags').innerHTML = tags.map((tag) => `<span class="detail-tag">${esc(tag)}</span>`).join('');
    $('#detailTagsRow').classList.remove('hidden');
  }
  if (movie.notes) {
    $('#detailNotes').textContent = movie.notes;
    $('#detailNotesRow').classList.remove('hidden');
  }
  if (movie.director) {
    $('#detailDirector').innerHTML = `<span class="credits-director" style="pointer-events:none">
      <span class="credits-accent"></span>
      <span class="credits-avatar credits-avatar-lg credits-avatar-plh">👤</span>
      <span class="credits-director-text">
        <span class="credits-director-name">${esc(movie.director)}</span>
        <span class="credits-director-role">导演</span>
      </span>
    </span>`;
  }
}

async function fetchTMDBDetails(tmdbId, tmdbKey) {
  const url = `https://api.themoviedb.org/3/movie/${tmdbId}?api_key=${tmdbKey}&language=zh-CN&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB fetch failed');
  return res.json();
}

function renderTMDBDetails(tmdb) {
  const bgUrl = backdropUrl(tmdb) || posterUrl({ poster_path: tmdb.poster_path });
  if (bgUrl) {
    $('#detailBackdrop').src = bgUrl;
    $('#detailBackdrop').classList.remove('hidden');
    $('#detailBannerPlaceholder').classList.add('hidden');
    $('#detailBanner').classList.add('has-backdrop');
  }

  if (tmdb.release_date) $('#detailYear').textContent = tmdb.release_date.slice(0, 4);
  if (tmdb.runtime) $('#detailRuntime').textContent = `${tmdb.runtime} 分钟`;
  if (tmdb.genres?.length) $('#detailGenres').textContent = tmdb.genres.map(g => g.name).join(' / ');

  if (tmdb.vote_average) {
    $('#detailTmdbRating').classList.remove('hidden');
    $('#detailTmdbRating').innerHTML = `<span class="tmdb-star">★</span><span class="tmdb-score">${tmdb.vote_average.toFixed(1)}</span><span class="tmdb-votes">(${tmdb.vote_count} 票)</span>`;
  }

  if (tmdb.credits?.crew) {
    const directors = tmdb.credits.crew.filter(p => p.job === 'Director');
    if (directors.length > 0) {
      $('#detailDirector').innerHTML = directors.map(d => {
        const avatarHtml = d.profile_path
          ? `<img class="credits-avatar credits-avatar-lg" src="${TMDB_PROFILE_BASE}${d.profile_path}" alt="" loading="lazy">`
          : '<span class="credits-avatar credits-avatar-lg credits-avatar-plh">👤</span>';
        return `<button class="credits-director" data-person-id="${d.id}" data-person-name="${esc(d.name)}">
          <span class="credits-accent"></span>
          ${avatarHtml}
          <span class="credits-director-text">
            <span class="credits-director-name">${esc(d.name)}</span>
            <span class="credits-director-role">导演</span>
          </span>
        </button>`;
      }).join('');
    }
  }

  if (tmdb.credits?.cast?.length) {
    $('#detailCast').innerHTML = tmdb.credits.cast.slice(0, 12).map((p, i) => {
      const avatarHtml = p.profile_path
        ? `<img class="credits-avatar credits-avatar-sm" src="${TMDB_PROFILE_BASE}${p.profile_path}" alt="" loading="lazy">`
        : '<span class="credits-avatar credits-avatar-sm credits-avatar-plh">👤</span>';
      const character = p.character ? `<span class="credits-cast-role">${esc(p.character)}</span>` : '';
      return `<button class="credits-cast-item" data-person-id="${p.id}" data-person-name="${esc(p.name)}">
        ${avatarHtml}
        <span class="credits-cast-name">${esc(p.name)}</span>
        ${character}
      </button>`;
    }).join('');
  } else {
    $('#detailCast').innerHTML = '';
  }

  $('#detailOverview').textContent = tmdb.overview || '暂无简介';

  // Bind click handlers for director and cast chips
  const bindChip = (chip) => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const personId = Number(chip.dataset.personId);
      const personName = chip.dataset.personName;
      if (_openPersonDetail && personId) {
        push({ type: 'movie', movie: { ...currentDetailMovie } });
        _openPersonDetail({ id: personId, name: personName });
      }
    });
  };

  $('#detailDirector').querySelectorAll('.credits-director').forEach(bindChip);
  $('#detailCast').querySelectorAll('.credits-cast-item').forEach(bindChip);
}

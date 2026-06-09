import { $ } from './dom.js';
import { getState, updateState } from './state.js';
import { posterUrl, backdropUrl, esc } from './utils.js';
import { TMDB_PROFILE_BASE, getTMDBBase } from './constants.js';
import { api } from './api.js';
import { deleteMovie, loadMovies } from './movies.js';
import { showToast } from './toast.js';
import { push, pop, canGoBack, clearStack } from './detailStack.js';
import { goPerson } from './navigation.js';

let currentDetailMovie = null;
let _tmdbCredits = null;
let _lastTmdbData = null;

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
      $('#detailOverview').textContent = '暂无简介';
    }
  } else {
    $('#detailCast').innerHTML = '';
    $('#detailOverview').textContent = '暂无简介';
  }
}

export function closeDetail() {
  $('#detailOverlay').classList.add('hidden');
  $('#deleteConfirmOverlay').classList.add('hidden');
  clearStack();
  currentDetailMovie = null;
  _tmdbCredits = null;
  _lastTmdbData = null;
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

  // Add-to-list button
  $('#detailCollectBtn').addEventListener('click', async () => {
    if (!currentDetailMovie) return;
    const state = getState();
    const alreadyCollected = currentDetailMovie.id || state.existingTmdbIds.has(currentDetailMovie.tmdb_id);
    if (alreadyCollected) return;

    const movie = currentDetailMovie;
    const tmdb = _lastTmdbData;
    const tags = (movie.tags?.length ? movie.tags : (tmdb?.genres || []).map(g => g.name));
    const notes = movie.notes || tmdb?.overview || '';

    try {
      await api(`/api/lists/${state.currentListId}/movies`, {
        method: 'POST',
        body: JSON.stringify({
          title: movie.title,
          year: movie.year ? Number(movie.year) : null,
          poster_path: movie.poster_path || '',
          tmdb_id: movie.tmdb_id || null,
          rating: movie.rating || (tmdb?.vote_average || 0),
          status: 'watched',
          tags,
          notes,
        }),
      });
      updateState(draft => { draft.existingTmdbIds.add(movie.tmdb_id); });
      updateCollectButton(true);
      showToast('已添加');
      loadMovies().catch(() => {});
    } catch (err) {
      showToast(err.message || '添加失败', true);
    }
  });
}

function goBack() {
  const prev = pop();
  if (!prev) { closeDetail(); return; }

  $('#detailOverlay').classList.add('hidden');
  currentDetailMovie = null;
  _tmdbCredits = null;

  if (prev.type === 'person') {
    goPerson({ id: prev.id, name: prev.name });
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
  updateCollectButton(!!(movie.id || (movie.tmdb_id && getState().existingTmdbIds.has(movie.tmdb_id))));
}

function updateCollectButton(collected) {
  const btn = $('#detailCollectBtn');
  const label = $('#detailCollectLabel');
  if (collected) {
    btn.classList.add('collected');
    label.textContent = '已添加';
  } else {
    btn.classList.remove('collected');
    label.textContent = '添加';
  }
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
  const url = `${getTMDBBase()}/movie/${tmdbId}?api_key=${tmdbKey}&language=zh-CN&append_to_response=credits`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('TMDB fetch failed');
  return res.json();
}

function renderTMDBDetails(tmdb) {
  _lastTmdbData = tmdb;
  const bgUrl = backdropUrl(tmdb) || posterUrl({ poster_path: tmdb.poster_path });
  if (bgUrl) {
    $('#detailBackdrop').src = bgUrl;
    $('#detailBackdrop').classList.remove('hidden');
    $('#detailBannerPlaceholder').classList.add('hidden');
    $('#detailBanner').classList.add('has-backdrop');
  }

  if (tmdb.release_date) $('#detailYear').textContent = tmdb.release_date.slice(0, 4);
  if (tmdb.runtime) $('#detailRuntime').textContent = `${tmdb.runtime} 分钟`;
  if (tmdb.genres?.length) {
    $('#detailGenres').textContent = tmdb.genres.map(g => g.name).join(' / ');
    // For uncollected movies without own tags, show TMDB genres as tags
    if (currentDetailMovie && !currentDetailMovie.tags?.length) {
      $('#detailTags').innerHTML = tmdb.genres.map(g => `<span class="detail-tag">${esc(g.name)}</span>`).join('');
      $('#detailTagsRow').classList.remove('hidden');
    }
  }

  if (tmdb.vote_average) {
    $('#detailTmdbRating').classList.remove('hidden');
    $('#detailTmdbRating').innerHTML = `<span class="tmdb-star">★</span><span class="tmdb-score">${tmdb.vote_average.toFixed(1)}</span><span class="tmdb-votes">(${tmdb.vote_count} 票)</span>`;

    // Lazy backfill: persist TMDB rating for cards that don't have one yet
    if (currentDetailMovie && !currentDetailMovie.rating && tmdb.vote_average) {
      const newRating = tmdb.vote_average;
      api(`/api/movies/${currentDetailMovie.id}`, {
        method: 'PUT',
        body: JSON.stringify({ rating: newRating }),
      }).then(() => {
        if (currentDetailMovie) currentDetailMovie.rating = newRating;
        loadMovies().catch(() => {});
      }).catch(() => {});
    }
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
      if (personId) {
        push({ type: 'movie', movie: { ...currentDetailMovie } });
        goPerson({ id: personId, name: personName });
      }
    });
  };

  $('#detailDirector').querySelectorAll('.credits-director').forEach(bindChip);
  $('#detailCast').querySelectorAll('.credits-cast-item').forEach(bindChip);
}

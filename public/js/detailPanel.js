import { $ } from './dom.js';
import { getState, updateState } from './state.js';
import { posterUrl, backdropUrl, esc } from './utils.js';
import { TMDB_PROFILE_BASE } from './constants.js';
import { api } from './api.js';
import { deleteMovie } from './movies.js';
import { showToast } from './toast.js';
import { push, pop, canGoBack, clearStack } from './detailStack.js';
import { goPerson } from './navigation.js';
import { showDeleteConfirm, closeDeleteConfirm } from './deleteConfirm.js';
import { fetchTMDBMovieWithCredits, fetchSimilarMovies, fetchCollection, getCachedMovie } from './tmdbApi.js';

const COUNTRY_ZH = {
  US: '美国', GB: '英国', FR: '法国', DE: '德国', IT: '意大利',
  JP: '日本', KR: '韩国', CN: '中国', HK: '中国香港', TW: '中国台湾',
  CA: '加拿大', AU: '澳大利亚', NZ: '新西兰', IN: '印度',
  ES: '西班牙', MX: '墨西哥', BR: '巴西', RU: '俄罗斯',
  SE: '瑞典', NO: '挪威', DK: '丹麦', NL: '荷兰', BE: '比利时',
  IE: '爱尔兰', PL: '波兰', CZ: '捷克', AT: '奥地利', CH: '瑞士',
};

let currentDetailMovie = null;
let _lastTmdbData = null;

export async function openDetail(movie) {
  currentDetailMovie = movie;

  $('#personDetailOverlay').classList.add('hidden');
  $('#detailOverlay').classList.remove('hidden');
  $('.detail-panel').scrollTop = 0;
  document.body.style.overflow = 'hidden';
  closeDeleteConfirm();
  updateBackButton();

  resetDetail(movie);
  renderLocalMovieDetails(movie);

  const state = getState();
  if (movie.tmdb_id && state.tmdbKey) {
    try {
      const tmdb = await fetchTMDBMovieWithCredits(movie.tmdb_id);
      renderTMDBDetails(tmdb);
      loadSimilarMovies(movie.tmdb_id);
    } catch {
      $('#detailCast').innerHTML = '';
      $('#detailSimilar').innerHTML = '';
    }
  } else {
    $('#detailCast').innerHTML = '';
    $('#detailSimilar').innerHTML = '';
  }
}

export function closeDetail() {
  $('#detailOverlay').classList.add('hidden');
  closeDeleteConfirm();
  clearStack();
  currentDetailMovie = null;
  _lastTmdbData = null;
  document.body.style.overflow = '';
}

export function initDetailPanel() {
  $('#detailClose').addEventListener('click', closeDetail);
  $('#detailBack').addEventListener('click', goBack);
  $('#detailOverlay').addEventListener('click', (event) => {
    if (event.target === $('#detailOverlay')) closeDetail();
  });

  $('#detailDeleteBtn').addEventListener('click', () => {
    if (!currentDetailMovie) return;
    showDeleteConfirm(
      `确定删除<strong>《${esc(currentDetailMovie.title)}》</strong>吗？`,
      async () => {
        await deleteMovie(currentDetailMovie.id);
        closeDetail();
      }
    );
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
    const tagline = movie.tagline || tmdb?.tagline || '';

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
          tagline,
        }),
      });
      updateState(draft => { draft.existingTmdbIds.add(movie.tmdb_id); });
      updateCollectButton(true);
      updateState(d => { d.moviesVersion++; });
      showToast('已添加');
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
  $('#detailCountries').textContent = '';
  $('#detailGenres').innerHTML = '';
  $('#detailGenresSection').classList.add('hidden');
  $('#detailCollectionSection').classList.add('hidden');
  $('#detailTmdbRating').classList.add('hidden');
  $('#detailTmdbRating').innerHTML = '';
  $('#detailSimilar').innerHTML = '';
  $('#detailSimilarSection').style.display = 'none';
  $('#detailCast').innerHTML = '<span class="detail-loading">加载中...</span>';
  $('#detailDirector').innerHTML = '';
  $('#detailNotesSection').classList.add('hidden');
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
  if (movie.notes) {
    $('#detailNotes').textContent = movie.notes;
    $('#detailNotesSection').classList.remove('hidden');
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
  if (tmdb.production_countries?.length) {
    const names = tmdb.production_countries.map(c => COUNTRY_ZH[c.iso_3166_1] || c.name).join(' / ');
    $('#detailCountries').textContent = names;
  }
  if (tmdb.genres?.length) {
    $('#detailGenres').innerHTML = tmdb.genres.map(g =>
      `<span class="detail-genre">${esc(g.name)}</span>`
    ).join('<span class="detail-genre-sep">·</span>');
    $('#detailGenresSection').classList.remove('hidden');
  }

  // Show TMDB overview as 简介 for movies without local notes
  if (currentDetailMovie && !currentDetailMovie.notes && tmdb.overview) {
    $('#detailNotes').textContent = tmdb.overview;
    $('#detailNotesSection').classList.remove('hidden');
  }

  if (tmdb.vote_average) {
    $('#detailTmdbRating').classList.remove('hidden');
    $('#detailTmdbRating').innerHTML = `<span class="tmdb-star">★</span> <span class="tmdb-score">${tmdb.vote_average.toFixed(1)}</span><span class="tmdb-votes">${tmdb.vote_count.toLocaleString()} 人评价</span>`;

    // Lazy backfill: persist TMDB rating for cards that don't have one yet
    if (currentDetailMovie && !currentDetailMovie.rating && tmdb.vote_average) {
      const newRating = tmdb.vote_average;
      api(`/api/movies/${currentDetailMovie.id}`, {
        method: 'PUT',
        body: JSON.stringify({ rating: newRating }),
      }).then(() => {
        if (currentDetailMovie) currentDetailMovie.rating = newRating;
        updateState(d => { d.moviesVersion++; });
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

  // Collection — fetch and render series movie cards
  const collection = tmdb.belongs_to_collection;
  if (collection?.id) {
    fetchCollection(collection.id).then(({ name, movies }) => {
      if (!movies.length) return;
      const container = $('#detailCollection');
      container.innerHTML = `
        <p class="detail-collection-name">${esc(name)} · ${movies.length} 部</p>
        <div class="detail-collection-grid">
          ${movies.map(m => {
            const poster = m.poster_path
              ? `<img class="detail-collection-poster" src="https://image.tmdb.org/t/p/w200${m.poster_path}" alt="" loading="lazy">`
              : '<div class="detail-collection-noposter">🎬</div>';
            const year = m.release_date ? m.release_date.slice(0, 4) : '';
            return `
              <div class="detail-collection-item" data-tmdb-id="${m.id}">
                ${poster}
                <div class="detail-collection-title">${esc(m.title)}${year ? ` (${year})` : ''}</div>
              </div>`;
          }).join('')}
        </div>`;
      $('#detailCollectionSection').classList.remove('hidden');

      // Click → open detail for collection movie
      container.onclick = (e) => {
        const item = e.target.closest('.detail-collection-item');
        if (item) {
          const id = Number(item.dataset.tmdbId);
          const cached = getCachedMovie(id);
          if (cached) {
            push({ type: 'movie', movie: { ...currentDetailMovie } });
            openDetail({ tmdb_id: id, title: cached.title, year: cached.year, poster_path: cached.poster_path });
          }
        }
      };

      // Wheel → horizontal scroll
      const cGrid = container.querySelector('.detail-collection-grid');
      cGrid.onwheel = (e) => {
        e.preventDefault();
        cGrid.scrollLeft += e.deltaY;
      };
    });
  }

  $('#detailDirector').querySelectorAll('.credits-director').forEach(bindChip);
  $('#detailCast').querySelectorAll('.credits-cast-item').forEach(bindChip);
}

async function loadSimilarMovies(tmdbId) {
  const movies = await fetchSimilarMovies(tmdbId);
  if (!movies.length) return;

  const container = $('#detailSimilar');
  const section = $('#detailSimilarSection');

  container.innerHTML = movies.map(m => {
    const poster = m.poster_path
      ? `<img class="detail-similar-poster" src="https://image.tmdb.org/t/p/w200${m.poster_path}" alt="" loading="lazy">`
      : '<div class="detail-similar-noposter">🎬</div>';
    const year = m.release_date ? m.release_date.slice(0, 4) : '';
    return `
      <div class="detail-similar-item" data-tmdb-id="${m.id}">
        ${poster}
        <div class="detail-similar-title">${esc(m.title)}${year ? ` (${year})` : ''}</div>
      </div>
    `;
  }).join('');

  section.style.display = '';

  container.onclick = async (e) => {
    const item = e.target.closest('.detail-similar-item');
    if (item) {
      const id = Number(item.dataset.tmdbId);
      const cached = getCachedMovie(id);
      if (cached) {
        push({ type: 'movie', movie: { ...currentDetailMovie } });
        openDetail({ tmdb_id: id, title: cached.title, year: cached.year, poster_path: cached.poster_path });
      }
    }
  };

  container.onwheel = (e) => {
    e.preventDefault();
    container.scrollLeft += e.deltaY;
  };
}





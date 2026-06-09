import { $, $$ } from './dom.js';
import { getState, on, updateState } from './state.js';
import { fetchPopularMovies, fetchNowPlaying, getCachedMovie, fetchTMDBGenres, getTagline } from './tmdbApi.js';
import { api } from './api.js';
import { showToast } from './toast.js';
import { esc } from './utils.js';
import { openDetail } from './detailPanel.js';

let _openDetail = openDetail;

export function configureDiscover({ onOpenMovie }) {
  _openDetail = onOpenMovie;
}

export function initDiscover() {
  // Sidebar entry
  $('#sidebarDiscover').addEventListener('click', () => {
    updateState(d => { d.discoverTab = 'popular'; });
  });

  // Tab switching
  $('#discoverSection').addEventListener('click', (e) => {
    const tab = e.target.closest('.discover-tab');
    if (!tab) return;
    const tabName = tab.dataset.tab;
    updateState(d => { d.discoverTab = tabName; });
  });

  // Discover grid clicks (open detail or add)
  $('#discoverGrid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="add-discover"]');
    if (btn && !btn.classList.contains('added')) {
      e.stopPropagation();
      await addDiscoverMovie(btn);
      return;
    }

    const item = e.target.closest('.discover-item');
    if (item) {
      const tmdbId = Number(item.dataset.tmdbId);
      const cached = getCachedMovie(tmdbId);
      if (cached) {
        _openDetail({ tmdb_id: tmdbId, title: cached.title, year: cached.year, poster_path: cached.poster_path });
      }
    }
  });

  // React to discoverTab changes
  on('discoverTab', async (tab) => {
    if (!tab) {
      $('#discoverSection').classList.add('hidden');
      $('.toolbar').style.display = '';
      return;
    }

    // Show discover section, hide regular content
    $('.toolbar').style.display = 'none';
    $('#movieGrid').style.display = 'none';
    $('#emptyState').classList.add('hidden');
    $('#discoverSection').classList.remove('hidden');

    // Update tabs
    $$('.discover-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });

    // Load movies
    const movies = tab === 'popular'
      ? await fetchPopularMovies()
      : await fetchNowPlaying();

    updateState(d => { d.discoverMovies = movies; });
    renderDiscoverGrid(movies);
  });
}

function renderDiscoverGrid(movies) {
  const state = getState();
  const grid = $('#discoverGrid');
  const added = state.existingTmdbIds;

  grid.innerHTML = movies.map(m => {
    const poster = m.poster_path
      ? `<img class="card-poster-img" src="https://image.tmdb.org/t/p/w300${m.poster_path}" alt="" loading="lazy">`
      : '<div class="card-poster-placeholder"><span class="placeholder-catalog">CC</span><span class="placeholder-title" style="font-size:0.9rem">' + esc(m.title) + '</span></div>';
    const year = m.release_date ? m.release_date.slice(0, 4) : '';
    const rating = m.vote_average ? m.vote_average.toFixed(1) : '';
    const already = added.has(m.id);

    return `
      <div class="movie-card discover-item" data-tmdb-id="${m.id}">
        <div class="card-poster">${poster}</div>
        ${rating ? `<div class="card-rating">${rating}</div>` : ''}
        <div class="card-body">
          <div class="card-title-row">
            <h3 class="card-title">${esc(m.title)}</h3>
            <span class="card-year">${year || '-'}</span>
          </div>
          <p class="card-notes" style="min-height:0">${esc((m.overview || '').slice(0, 60))}${m.overview?.length > 60 ? '...' : ''}</p>
          <button class="tmdb-add-btn${already ? ' added' : ''}" data-action="add-discover" ${already ? 'disabled' : ''} style="margin-top:6px">${already ? '✓ 已收藏' : '+ 添加'}</button>
        </div>
      </div>
    `;
  }).join('');
}

async function addDiscoverMovie(btn) {
  const item = btn.closest('.discover-item');
  const tmdbId = Number(item.dataset.tmdbId);
  const cached = getCachedMovie(tmdbId);
  if (!cached) return;

  btn.textContent = '...'; btn.disabled = true;
  const state = getState();

  try {
    const [genres, tagline] = await Promise.all([
      fetchTMDBGenres(tmdbId).catch(() => []),
      getTagline(tmdbId).catch(() => ''),
    ]);

    await api(`/api/lists/${state.currentListId}/movies`, {
      method: 'POST',
      body: JSON.stringify({
        title: cached.title,
        year: cached.year ? Number(cached.year) : null,
        poster_path: cached.poster_path || '',
        tmdb_id: tmdbId,
        rating: cached.vote_average || 0,
        status: 'watched',
        tags: genres,
        tagline,
        notes: cached.overview || '',
      }),
    });

    updateState(draft => { draft.existingTmdbIds.add(tmdbId); });
    updateState(d => { d.moviesVersion++; });
    btn.classList.add('added');
    btn.textContent = '✓ 已收藏';
    showToast(`已添加《${cached.title}》`);
  } catch (err) {
    showToast(err.message || '添加失败', true);
    btn.textContent = '+ 添加';
    btn.disabled = false;
  }
}

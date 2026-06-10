import { api } from './api.js';
import { $, $$ } from './dom.js';
import { getState, on, updateState } from './state.js';
import { showToast } from './toast.js';
import { createMovieCard } from './movieCard.js';
import { showDeletePopover } from './deletePopover.js';

let openMovieDetail = () => {};
let listSearchTimer;

// 订阅 moviesVersion，外部模块无需手动 import loadMovies
on('moviesVersion', () => { loadMovies(); });

export function configureMovies({ onOpenMovie }) {
  openMovieDetail = onOpenMovie;
}

export async function loadMovies() {
  const state = getState();
  if (!state.currentListId) return;

  try {
    const params = new URLSearchParams();
    if (state.filters.listSearch) params.set('search', state.filters.listSearch);
    if (state.filters.tag) params.set('tag', state.filters.tag);
    if (state.filters.sort) params.set('sort', state.filters.sort);

    const movies = await api(`/api/lists/${state.currentListId}/movies?${params}`);
    const tagSet = new Set();
    const existingTmdbIds = new Set();

    movies.forEach((movie) => {
      if (Array.isArray(movie.tags)) movie.tags.forEach((tag) => tagSet.add(tag));
      if (movie.tmdb_id) existingTmdbIds.add(movie.tmdb_id);
    });

    updateState((draft) => {
      draft.movies = movies;
      draft.allTags = [...tagSet].sort();
      draft.existingTmdbIds = existingTmdbIds;
    });

    renderMovies();
  } catch {
    showToast('加载失败', true);
  }
}

function renderMovies() {
  const state = getState();
  const grid = $('#movieGrid');
  const empty = $('#emptyState');
  const list = state.lists.find((item) => item.id === state.currentListId);

  grid.innerHTML = '';
  $('#headerListName').textContent = list ? list.name : '片单';
  $('#headerCount').textContent = `${state.movies.length} 部电影`;

  if (state.movies.length === 0) {
    empty.classList.remove('hidden');
    grid.style.display = 'none';
  } else {
    empty.classList.add('hidden');
    grid.style.display = '';
    state.movies.forEach((movie, index) => {
      grid.appendChild(createMovieCard(movie, index, {
        onOpen: openMovieDetail,
        onDelete: (button, item) => showDeletePopover(button, item, () => deleteMovie(item.id)),
        onTag: filterByTag,
      }));
    });

    // Add card placeholder — scrolls to TMDB search bar; match real card height
    const addCard = document.createElement('div');
    addCard.className = 'card-add';
    addCard.innerHTML = '<span class="card-add-plus">+</span>';
    addCard.addEventListener('click', () => {
      const search = document.getElementById('tmdbSearch');
      if (search) search.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    grid.appendChild(addCard);

    const firstCard = grid.querySelector('.movie-card');
    if (firstCard) {
      addCard.style.height = firstCard.offsetHeight + 'px';
      addCard.style.width = firstCard.offsetWidth + 'px';
    }
  }

  updateTagFilterUI();
}

export async function deleteMovie(id) {
  try {
    await api(`/api/movies/${id}`, { method: 'DELETE' });
    showToast('已删除');
    updateState(d => { d.moviesVersion++; });
  } catch {
    showToast('删除失败', true);
  }
}

export function resetToolbar() {
  $('#listSearch').value = '';
  $('#sortSelect').value = 'created_at';
  $('#activeTagFilter').classList.add('hidden');
}

export function scheduleListSearch() {
  clearTimeout(listSearchTimer);
  listSearchTimer = setTimeout(() => {
    updateState((draft) => {
      draft.filters.listSearch = $('#listSearch').value.trim();
    });
    loadMovies();
  }, 250);
}

export function setSort(sort) {
  updateState((draft) => {
    draft.filters.sort = sort;
  });
  loadMovies();
}

function filterByTag(tag) {
  updateState((draft) => {
    draft.filters.tag = tag;
  });
  loadMovies();
}

export function clearTagFilter() {
  updateState((draft) => {
    draft.filters.tag = null;
  });
  loadMovies();
}

function updateTagFilterUI() {
  const state = getState();
  if (state.filters.tag) {
    $('#activeTagFilter').classList.remove('hidden');
    $('#activeTagName').textContent = state.filters.tag;
  } else {
    $('#activeTagFilter').classList.add('hidden');
  }
}

import { api } from './api.js';
import { $ } from './dom.js';
import { getState, updateState } from './state.js';
import { showToast } from './toast.js';
import { esc } from './utils.js';
import { loadMovies } from './movies.js';

export function openAddModal() {
  updateState((draft) => {
    draft.editingId = null;
    draft.formTags = [];
  });

  $('#modalTitle').textContent = '手动添加电影';
  $('#movieForm').reset();
  $('#formMovieId').value = '';
  $('#formYear').value = '';
  $('#formStatus').value = 'watched';
  $('#formRating').value = '0';
  renderFormTags();
  $('#modalOverlay').classList.remove('hidden');
  $('#formTitle').focus();
}

function openEditModal(movie) {
  updateState((draft) => {
    draft.editingId = movie.id;
    draft.formTags = Array.isArray(movie.tags) ? [...movie.tags] : [];
  });

  $('#modalTitle').textContent = '编辑电影';
  $('#formMovieId').value = movie.id;
  $('#formTitle').value = movie.title;
  $('#formYear').value = movie.year || '';
  $('#formDirector').value = movie.director || '';
  $('#formStatus').value = movie.status || 'watched';
  $('#formRating').value = movie.rating ?? 0;
  $('#formNotes').value = movie.notes || '';
  renderFormTags();
  $('#modalOverlay').classList.remove('hidden');
  $('#formTitle').focus();
}

export function closeModal() {
  $('#modalOverlay').classList.add('hidden');
  updateState((draft) => {
    draft.editingId = null;
  });
}

export function initMovieForm() {
  $('#formTagsList').addEventListener('click', removeTag);
  $('#formTags').addEventListener('keydown', addTagFromInput);
  $('#movieForm').addEventListener('submit', saveMovie);
}

function renderFormTags() {
  const state = getState();
  const list = $('#formTagsList');
  list.innerHTML = '';

  state.formTags.forEach((tag) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${esc(tag)} <button type="button" class="tag-pill-remove" data-tag="${esc(tag)}">✕</button>`;
    list.appendChild(pill);
  });
}

function removeTag(event) {
  const button = event.target.closest('.tag-pill-remove');
  if (!button) return;

  updateState((draft) => {
    draft.formTags = draft.formTags.filter((tag) => tag !== button.dataset.tag);
  });
  renderFormTags();
}

function addTagFromInput(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();

  const input = $('#formTags');
  const tag = input.value.trim();
  const state = getState();
  if (!tag || state.formTags.includes(tag)) {
    input.value = '';
    return;
  }

  updateState((draft) => {
    draft.formTags.push(tag);
  });
  input.value = '';
  renderFormTags();
}

async function saveMovie(event) {
  event.preventDefault();

  const state = getState();
  const title = $('#formTitle').value.trim();
  if (!title) return showToast('请输入电影名称', true);

  const data = {
    title,
    year: $('#formYear').value ? Number($('#formYear').value) : null,
    director: $('#formDirector').value.trim(),
    rating: Number($('#formRating').value),
    status: $('#formStatus').value,
    notes: $('#formNotes').value.trim(),
    tags: state.formTags,
    poster_path: '',
    tmdb_id: null,
  };

  try {
    if (state.editingId) {
      await api(`/api/movies/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      showToast('已更新');
    } else {
      await api(`/api/lists/${state.currentListId}/movies`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      showToast('已添加');
    }

    closeModal();
    await loadMovies();
  } catch (err) {
    showToast(err.message || '保存失败', true);
  }
}

import { api } from './api.js';
import { $ } from './dom.js';
import { getState, resetFilters, updateState } from './state.js';
import { showToast } from './toast.js';
import { esc } from './utils.js';
import { loadMovies, resetToolbar } from './movies.js';
import { showDeleteConfirm } from './deleteConfirm.js';

export async function loadLists() {
  try {
    let lists = await api('/api/lists');
    if (lists.length === 0) {
      await api('/api/lists', {
        method: 'POST',
        body: JSON.stringify({ name: '我的片单' }),
      });
      lists = await api('/api/lists');
    }

    const savedId = Number(localStorage.getItem('current_list_id'));
    const currentListId = savedId && lists.find((list) => list.id === savedId)
      ? savedId
      : lists[0].id;

    updateState((draft) => {
      draft.lists = lists;
      draft.currentListId = currentListId;
    });

    renderSidebar();
    await loadMovies();
  } catch (err) {
    console.error('loadLists failed:', err);
    showToast(err.message || '无法连接服务器', true);
  }
}

export function renderSidebar() {
  const state = getState();
  const nav = $('#listNav');
  nav.innerHTML = '';

  state.lists.forEach((list) => {
    const item = document.createElement('div');
    item.className = `list-nav-item${list.id === state.currentListId ? ' active' : ''}`;
    item.dataset.listId = list.id;
    item.innerHTML = `
      <span class="list-name">${esc(list.name)}</span>
      <span class="list-item-actions">
        <button class="list-action-btn" data-action="edit" title="编辑片单">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="list-action-btn" data-action="delete" title="删除片单">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </span>`;
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      switchList(list.id);
    });
    item.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
      e.stopPropagation();
      editList(list.id);
    });
    item.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteList(list.id);
    });
    nav.appendChild(item);
  });
}

function editList(listId) {
  const state = getState();
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  $('#listModalTitle').textContent = '编辑片单';
  $('#listFormId').value = list.id;
  $('#listFormName').value = list.name;
  $('#listFormDesc').value = list.description || '';
  $('#listModalOverlay').classList.remove('hidden');
  $('#listFormName').focus();
}

function deleteList(listId) {
  const state = getState();
  const list = state.lists.find(l => l.id === listId);
  if (!list) return;
  if (state.lists.length <= 1) { showToast('不能删除最后一个片单', true); return; }

  showDeleteConfirm(
    `确定删除<strong>《${esc(list.name)}》</strong>吗？片单内所有电影也会被删除。`,
    async () => {
      try {
        await api(`/api/lists/${listId}`, { method: 'DELETE' });
        const lists = await api('/api/lists');
        const newCurrentId = state.currentListId === listId ? (lists[0]?.id ?? null) : state.currentListId;
        updateState((draft) => { draft.lists = lists; draft.currentListId = newCurrentId; });
        if (newCurrentId) localStorage.setItem('current_list_id', newCurrentId);
        renderSidebar();
        resetToolbar();
        updateState(d => { d.moviesVersion++; });
        showToast('片单已删除');
      } catch (err) {
        showToast(err.message, true);
      }
    }
  );
}

async function switchList(listId) {
  const state = getState();
  if (listId === state.currentListId) return;

  updateState((draft) => {
    draft.currentListId = listId;
    draft.discoverTab = null;
  });
  resetFilters();
  localStorage.setItem('current_list_id', listId);

  renderSidebar();
  resetToolbar();
  updateState(d => { d.moviesVersion++; });
}



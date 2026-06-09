import { api } from './api.js';
import { $ } from './dom.js';
import { getState, updateState } from './state.js';
import { showToast } from './toast.js';
import { resetToolbar } from './movies.js';
import { renderSidebar } from './lists.js';

export function openNewListModal() {
  $('#listModalTitle').textContent = '新建片单';
  $('#listFormId').value = '';
  $('#listFormName').value = '';
  $('#listFormDesc').value = '';
  $('#listModalOverlay').classList.remove('hidden');
  $('#listFormName').focus();
}

export function closeListModal() {
  $('#listModalOverlay').classList.add('hidden');
}

export function initListForm() {
  $('#listForm').addEventListener('submit', saveList);
}

async function saveList(event) {
  event.preventDefault();

  const name = $('#listFormName').value.trim();
  if (!name) return showToast('请输入片单名称', true);

  const description = $('#listFormDesc').value.trim();
  const id = $('#listFormId').value;

  try {
    if (id) {
      await api(`/api/lists/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ name, description }),
      });
    } else {
      const created = await api('/api/lists', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      });
      updateState((draft) => {
        draft.currentListId = created.id;
      });
      localStorage.setItem('current_list_id', created.id);
    }

    const lists = await api('/api/lists');
    updateState((draft) => {
      draft.lists = lists;
    });

    closeListModal();
    renderSidebar();
    resetToolbar();
    updateState(d => { d.moviesVersion++; });
    showToast(id ? '片单已更新' : '片单已创建');
  } catch (err) {
    showToast(err.message, true);
  }
}

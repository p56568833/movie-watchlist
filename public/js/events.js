import { $ } from './dom.js';
import { openAddModal, closeModal } from './movieForm.js';
import { openSettings, closeSettings } from './settings.js';
import { closeDropdown, openTMDBSettings } from './tmdbSearch.js';
import { openNewListModal, closeListModal } from './listForm.js';
import { closeDetail } from './detailPanel.js';
import {
  clearTagFilter,
  scheduleListSearch,
  setSort,
} from './movies.js';

export function setupEvents() {
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (event) => {
    if (event.target === $('#modalOverlay')) closeModal();
  });

  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsCancel').addEventListener('click', closeSettings);
  $('#settingsOverlay').addEventListener('click', (event) => {
    if (event.target === $('#settingsOverlay')) closeSettings();
  });
  $('#tmdbGoSettings').addEventListener('click', openTMDBSettings);

  $('#sidebarAddBtn').addEventListener('click', openNewListModal);
  $('#listModalClose').addEventListener('click', closeListModal);
  $('#listModalCancel').addEventListener('click', closeListModal);
  $('#listModalOverlay').addEventListener('click', (event) => {
    if (event.target === $('#listModalOverlay')) closeListModal();
  });

  $('#listSearch').addEventListener('input', scheduleListSearch);
  $('#sortSelect').addEventListener('change', () => setSort($('#sortSelect').value));
  $('#clearTagFilter').addEventListener('click', clearTagFilter);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#modalOverlay').classList.contains('hidden')) closeModal();
    else if (!$('#detailOverlay').classList.contains('hidden')) closeDetail();
    else if (!$('#settingsOverlay').classList.contains('hidden')) closeSettings();
    else if (!$('#listModalOverlay').classList.contains('hidden')) closeListModal();
    else closeDropdown();
  });
}

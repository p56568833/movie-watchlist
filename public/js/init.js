import { setupEvents } from './events.js';
import { loadLists } from './lists.js';
import { configureMovies } from './movies.js';
import { openDetail, initDetailPanel, setPersonDetailOpener } from './detailPanel.js';
import { initDeletePopover } from './deletePopover.js';
import { initListForm } from './listForm.js';
import { initMovieForm } from './movieForm.js';
import { initSettings } from './settings.js';
import { initTMDBSearch } from './tmdbSearch.js';
import { initPersonDetail, setMovieDetailOpener, openPersonDetail } from './personDetail.js';

export default async function init() {
  configureMovies({ onOpenMovie: openDetail });

  // Wire up cross-navigation between detail panels
  setPersonDetailOpener(openPersonDetail);
  setMovieDetailOpener(openDetail);

  initDeletePopover();
  initDetailPanel();
  initPersonDetail();
  initListForm();
  initMovieForm();
  initSettings();
  initTMDBSearch();
  setupEvents();

  await loadLists();
}

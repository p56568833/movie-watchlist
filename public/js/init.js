import { detectTMDB } from './constants.js';
import { checkAuth, login, register, logout, getUser } from './auth.js';
import { setupEvents } from './events.js';
import { loadLists } from './lists.js';
import { configureMovies } from './movies.js';
import { openDetail, initDetailPanel } from './detailPanel.js';
import { initDeletePopover } from './deletePopover.js';
import { initDeleteConfirm } from './deleteConfirm.js';
import { initListForm } from './listForm.js';
import { initMovieForm } from './movieForm.js';
import { initSettings } from './settings.js';
import { initTMDBSearch } from './tmdbSearch.js';
import { initPersonDetail, openPersonDetail } from './personDetail.js';
import { $ } from './dom.js';
import { initNavigation } from './navigation.js';
import { initDiscover, configureDiscover } from './discover.js';

let isLoginMode = true;

export default async function init() {
  detectTMDB();

  // Show user name if logged in
  const user = getUser();
  if (user) {
    $('#sidebarUser').textContent = user.username;
    $('#sidebarUser').title = '点击退出登录';
    $('#sidebarUser').addEventListener('click', logout);
  }

  // Check auth
  const authed = await checkAuth();
  if (!authed) {
    showAuthModal();
    return;
  }

  startApp();
}

function showAuthModal() {
  $('#authOverlay').classList.remove('hidden');
  $('#authUsername').focus();

  $('#authForm').addEventListener('submit', handleAuth);
  $('#authSwitch').addEventListener('click', toggleMode);
}

function hideAuthModal() {
  $('#authOverlay').classList.add('hidden');
}

function toggleMode(e) {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  $('#authTitle').textContent = isLoginMode ? '登录' : '注册';
  $('#authSubmit').textContent = isLoginMode ? '登录' : '注册';
  $('#authSwitch').textContent = isLoginMode ? '注册账号' : '已有账号？登录';
  $('#authError').classList.add('hidden');
}

async function handleAuth(e) {
  e.preventDefault();
  const username = $('#authUsername').value.trim();
  const password = $('#authPassword').value;
  const errEl = $('#authError');

  if (!username || !password) {
    errEl.textContent = '请填写用户名和密码';
    errEl.classList.remove('hidden');
    return;
  }

  try {
    if (isLoginMode) {
      await login(username, password);
    } else {
      await register(username, password);
    }
    hideAuthModal();
    startApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  }
}

async function startApp() {
  hideAuthModal();

  const user = getUser();
  if (user) {
    $('#sidebarUser').textContent = user.username;
    $('#sidebarUser').title = '点击退出登录';
    $('#sidebarUser').addEventListener('click', logout);
  }

  configureMovies({ onOpenMovie: openDetail });
  configureDiscover({ onOpenMovie: openDetail });
  initNavigation({ openDetail, openPerson: openPersonDetail });

  initDeletePopover();
  initDeleteConfirm();
  initDetailPanel();
  initPersonDetail();
  initListForm();
  initMovieForm();
  initSettings();
  initTMDBSearch();
  setupEvents();
  initDiscover();

  await loadLists();
}

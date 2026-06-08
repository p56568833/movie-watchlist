/* ═══════════════════════════════════════════════════════
   CC 铁皮电影盘 · APP v2
   多片单 + TMDB 搜索 + 自动填充
   ═══════════════════════════════════════════════════════ */

// ── DOM Helpers ──────────────────────────────────────
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// ── State ────────────────────────────────────────────
const state = {
  lists: [],
  currentListId: null,
  movies: [],
  allTags: [],
  filters: { search: '', status: 'all', tag: null, sort: 'created_at' },
  editingId: null,
  formTags: [],
  formRating: 0,
  formStatus: 'watched',
  tmdbPosterPath: null,
  tmdbId: null,
};

// ── TMDB Config ──────────────────────────────────────
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_SEARCH_URL = 'https://api.themoviedb.org/3/search/movie';
let tmdbKey = localStorage.getItem('tmdb_api_key') || '';

// ── API Helpers ──────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function posterUrl(movie) {
  if (movie.poster_path) return TMDB_IMAGE_BASE + movie.poster_path;
  if (movie.poster_url) return movie.poster_url;
  return null;
}

// ── Init ─────────────────────────────────────────────
async function init() {
  await loadLists();
  setupEvents();
}

async function loadLists() {
  try {
    state.lists = await api('/api/lists');
    if (state.lists.length === 0) {
      // Create default
      await api('/api/lists', { method: 'POST', body: JSON.stringify({ name: '我的片单' }) });
      state.lists = await api('/api/lists');
    }
    // Restore or select first
    const savedId = Number(localStorage.getItem('current_list_id'));
    if (savedId && state.lists.find(l => l.id === savedId)) {
      state.currentListId = savedId;
    } else {
      state.currentListId = state.lists[0].id;
    }
    renderSidebar();
    await loadMovies();
  } catch (err) {
    showToast('无法连接服务器', true);
  }
}

// ── Sidebar ──────────────────────────────────────────
function renderSidebar() {
  const nav = $('#listNav');
  nav.innerHTML = '';

  state.lists.forEach(list => {
    const item = document.createElement('div');
    item.className = 'sidebar-item' + (list.id === state.currentListId ? ' active' : '');
    item.dataset.listId = list.id;
    item.innerHTML = `
      <span class="sidebar-item-name">${escapeHtml(list.name)}</span>
      <span class="sidebar-item-count">${list.id === state.currentListId ? state.movies.length : ''}</span>
    `;
    item.addEventListener('click', () => switchList(list.id));
    nav.appendChild(item);
  });
}

function updateSidebarCounts() {
  const items = $$('.sidebar-item');
  items.forEach(item => {
    const id = Number(item.dataset.listId);
    const countSpan = item.querySelector('.sidebar-item-count');
    if (id === state.currentListId) {
      countSpan.textContent = state.movies.length;
    }
  });
}

async function switchList(listId) {
  if (listId === state.currentListId) return;
  state.currentListId = listId;
  state.filters = { search: '', status: 'all', tag: null, sort: 'created_at' };
  localStorage.setItem('current_list_id', listId);
  renderSidebar();
  resetToolbar();
  await loadMovies();
}

function resetToolbar() {
  $('#searchInput').value = '';
  $$('.filter-chip').forEach(c => c.classList.remove('active'));
  $('.filter-chip[data-status="all"]').classList.add('active');
  $('#sortSelect').value = 'created_at';
  $('#activeTagFilter').classList.add('hidden');
}

// ── List CRUD Modals ─────────────────────────────────
function openNewListModal() {
  $('#listModalTitle').textContent = '新建片单';
  $('#listFormId').value = '';
  $('#listFormName').value = '';
  $('#listFormDesc').value = '';
  $('#listModalOverlay').classList.remove('hidden');
  $('#listFormName').focus();
}

function openEditListModal() {
  const list = state.lists.find(l => l.id === state.currentListId);
  if (!list) return;
  $('#listModalTitle').textContent = '编辑片单';
  $('#listFormId').value = list.id;
  $('#listFormName').value = list.name;
  $('#listFormDesc').value = list.description || '';
  $('#listModalOverlay').classList.remove('hidden');
  $('#listFormName').focus();
}

function closeListModal() {
  $('#listModalOverlay').classList.add('hidden');
}

$('#listForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#listFormName').value.trim();
  if (!name) return showToast('请输入片单名称', true);
  const desc = $('#listFormDesc').value.trim();
  const id = $('#listFormId').value;

  try {
    if (id) {
      await api(`/api/lists/${id}`, { method: 'PUT', body: JSON.stringify({ name, description: desc }) });
      showToast('片单已更新');
    } else {
      const created = await api('/api/lists', { method: 'POST', body: JSON.stringify({ name, description: desc }) });
      state.currentListId = created.id;
      localStorage.setItem('current_list_id', created.id);
      showToast('片单已创建');
    }
    closeListModal();
    state.lists = await api('/api/lists');
    renderSidebar();
    resetToolbar();
    await loadMovies();
  } catch (err) {
    showToast(err.message, true);
  }
});

async function deleteCurrentList() {
  const list = state.lists.find(l => l.id === state.currentListId);
  if (!list) return;
  if (!confirm(`确定要删除片单「${list.name}」吗？\n片单内的所有电影也会被删除，此操作不可撤销。`)) return;
  try {
    await api(`/api/lists/${state.currentListId}`, { method: 'DELETE' });
    showToast('片单已删除');
    state.lists = await api('/api/lists');
    state.currentListId = state.lists[0]?.id;
    if (state.currentListId) localStorage.setItem('current_list_id', state.currentListId);
    renderSidebar();
    resetToolbar();
    await loadMovies();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ── Load Movies ──────────────────────────────────────
async function loadMovies() {
  if (!state.currentListId) return;
  try {
    const params = new URLSearchParams();
    if (state.filters.search) params.set('search', state.filters.search);
    if (state.filters.status !== 'all') params.set('status', state.filters.status);
    if (state.filters.tag) params.set('tag', state.filters.tag);
    if (state.filters.sort) params.set('sort', state.filters.sort);

    state.movies = await api(`/api/lists/${state.currentListId}/movies?${params}`);
    state.allTags = await api(`/api/lists/${state.currentListId}/tags`);
    render();
    updateSidebarCounts();
  } catch (err) {
    showToast('加载失败', true);
  }
}

function render() {
  const grid = $('#movieGrid');
  const empty = $('#emptyState');
  grid.innerHTML = '';

  const list = state.lists.find(l => l.id === state.currentListId);
  $('#headerListName').textContent = list ? list.name : '片单';
  $('#headerCount').textContent = `${state.movies.length} 部电影`;

  if (state.movies.length === 0) {
    empty.classList.remove('hidden');
    grid.style.display = 'none';
  } else {
    empty.classList.add('hidden');
    grid.style.display = '';
    state.movies.forEach((movie, i) => {
      const card = createMovieCard(movie, i);
      grid.appendChild(card);
    });
  }

  updateTagFilterUI();

  // Load list counts for sidebar (lightweight)
  updateSidebarCounts();
}

// ── Movie Card ───────────────────────────────────────
function createMovieCard(movie, index) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.style.animationDelay = `${index * 0.04}s`;
  card.dataset.id = movie.id;

  // Poster
  const poster = document.createElement('div');
  poster.className = 'card-poster';
  const url = posterUrl(movie);
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = movie.title;
    img.loading = 'lazy';
    img.onerror = () => { img.remove(); poster.appendChild(placeholderEl()); };
    poster.appendChild(img);
  } else {
    poster.appendChild(placeholderEl());
  }

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';
  const title = document.createElement('h3');
  title.className = 'card-title';
  title.textContent = movie.title;
  const year = document.createElement('span');
  year.className = 'card-year';
  year.textContent = movie.year || '—';
  titleRow.appendChild(title);
  titleRow.appendChild(year);

  const director = document.createElement('p');
  director.className = 'card-director';
  director.textContent = movie.director || '';

  const stars = document.createElement('div');
  stars.className = 'card-stars';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className = 'card-star' + (i <= movie.rating ? ' filled' : '');
    s.textContent = '★';
    stars.appendChild(s);
  }

  const status = document.createElement('span');
  status.className = `card-status ${movie.status}`;
  status.textContent = movie.status === 'watched' ? '已看' : '想看';

  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'card-tags';
  const tags = Array.isArray(movie.tags) ? movie.tags : [];
  tags.forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'card-tag';
    chip.textContent = tag;
    chip.addEventListener('click', (e) => { e.stopPropagation(); filterByTag(tag); });
    tagsDiv.appendChild(chip);
  });

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const editBtn = document.createElement('button');
  editBtn.className = 'card-action';
  editBtn.textContent = '编辑';
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(movie); });
  const delBtn = document.createElement('button');
  delBtn.className = 'card-action delete';
  delBtn.textContent = '删除';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMovie(movie.id); });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);

  body.appendChild(titleRow);
  if (movie.director) body.appendChild(director);
  body.appendChild(stars);
  body.appendChild(status);
  if (tags.length > 0) body.appendChild(tagsDiv);
  body.appendChild(actions);

  card.appendChild(poster);
  card.appendChild(body);
  return card;
}

function placeholderEl() {
  const div = document.createElement('div');
  div.className = 'card-poster-placeholder';
  div.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>NO ARTWORK</span>`;
  return div;
}

async function deleteMovie(id) {
  if (!confirm('确定要删除这部电影吗？')) return;
  try {
    await api(`/api/movies/${id}`, { method: 'DELETE' });
    showToast('已删除');
    await loadMovies();
  } catch (err) {
    showToast('删除失败', true);
  }
}

// ── TMDB Search ──────────────────────────────────────
let tmdbTimer;
$('#tmdbSearch').addEventListener('input', () => {
  clearTimeout(tmdbTimer);
  tmdbTimer = setTimeout(() => searchTMDB($('#tmdbSearch').value.trim()), 400);
});

async function searchTMDB(query) {
  const container = $('#tmdbResults');
  const hint = $('#tmdbHint');

  if (!tmdbKey) {
    hint.classList.remove('hidden');
    container.innerHTML = '';
    return;
  }

  hint.classList.add('hidden');

  if (query.length < 2) {
    container.innerHTML = '';
    return;
  }

  try {
    const url = `${TMDB_SEARCH_URL}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) {
        container.innerHTML = '<div class="tmdb-result-item tmdb-error">API Key 无效，请检查设置</div>';
      } else {
        container.innerHTML = '<div class="tmdb-result-item tmdb-error">搜索失败，请稍后重试</div>';
      }
      return;
    }
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      container.innerHTML = '<div class="tmdb-result-item tmdb-empty">未找到匹配电影</div>';
      return;
    }

    container.innerHTML = data.results.slice(0, 8).map(m => {
      const poster = m.poster_path
        ? `<img src="${TMDB_IMAGE_BASE}${m.poster_path}" alt="" loading="lazy">`
        : '<div class="tmdb-no-poster">🎬</div>';
      const year = m.release_date ? m.release_date.slice(0, 4) : '';
      return `
        <div class="tmdb-result-item" data-tmdb-id="${m.id}" data-title="${escapeHtml(m.title)}" data-year="${year}" data-poster="${m.poster_path || ''}" data-overview="${escapeHtml(m.overview || '')}">
          ${poster}
          <div class="tmdb-result-info">
            <span class="tmdb-result-title">${escapeHtml(m.title)}${year ? ` <span class="tmdb-result-year">(${year})</span>` : ''}</span>
            <span class="tmdb-result-overview">${escapeHtml((m.overview || '').slice(0, 100))}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    container.innerHTML = '<div class="tmdb-result-item tmdb-error">网络错误，请检查连接</div>';
  }
}

$('#tmdbResults').addEventListener('click', (e) => {
  const item = e.target.closest('.tmdb-result-item');
  if (!item || !item.dataset.tmdbId) return;

  // Auto-fill form
  $('#formTitle').value = item.dataset.title;
  $('#formYear').value = item.dataset.year || '';
  state.tmdbPosterPath = item.dataset.poster || null;
  state.tmdbId = Number(item.dataset.tmdbId);

  // Show preview
  const previewRow = $('#previewRow');
  const previewPoster = $('#previewPoster');
  if (state.tmdbPosterPath) {
    previewPoster.src = TMDB_IMAGE_BASE + state.tmdbPosterPath;
    previewRow.classList.remove('hidden');
  } else {
    previewRow.classList.add('hidden');
  }

  // Clear TMDB results
  $('#tmdbResults').innerHTML = '';
  $('#tmdbSearch').value = item.dataset.title;

  showToast('已自动填充电影信息');
});

// ── Settings ─────────────────────────────────────────
function openSettings() {
  $('#apiKeyInput').value = tmdbKey;
  $('#settingsStatus').textContent = '';
  $('#settingsOverlay').classList.remove('hidden');
}

function closeSettings() {
  $('#settingsOverlay').classList.add('hidden');
}

$('#settingsSave').addEventListener('click', () => {
  const val = $('#apiKeyInput').value.trim();
  if (!val) {
    $('#settingsStatus').textContent = '请输入 API Key';
    return;
  }
  tmdbKey = val;
  localStorage.setItem('tmdb_api_key', val);
  $('#settingsStatus').textContent = '✅ API Key 已保存';
  setTimeout(closeSettings, 800);
});

// ── Modal: Add/Edit Movie ────────────────────────────
function openAddModal() {
  state.editingId = null;
  state.formTags = [];
  state.formRating = 0;
  state.formStatus = 'watched';
  state.tmdbPosterPath = null;
  state.tmdbId = null;
  $('#modalTitle').textContent = '添加电影';
  $('#movieForm').reset();
  $('#formMovieId').value = '';
  $('#formYear').value = '';
  $('#tmdbSearch').value = '';
  $('#tmdbResults').innerHTML = '';
  $('#previewRow').classList.add('hidden');
  renderFormStars();
  renderFormStatus();
  renderFormTags();
  $('#modalOverlay').classList.remove('hidden');

  // Show/hide TMDB hint
  if (!tmdbKey) {
    $('#tmdbHint').classList.remove('hidden');
  } else {
    $('#tmdbHint').classList.add('hidden');
  }

  $('#tmdbSearch').focus();
}

function openEditModal(movie) {
  state.editingId = movie.id;
  state.formTags = Array.isArray(movie.tags) ? [...movie.tags] : [];
  state.formRating = movie.rating || 0;
  state.formStatus = movie.status || 'watched';
  state.tmdbPosterPath = movie.poster_path || null;
  state.tmdbId = movie.tmdb_id || null;
  $('#modalTitle').textContent = '编辑电影';
  $('#formMovieId').value = movie.id;
  $('#formTitle').value = movie.title;
  $('#formYear').value = movie.year || '';
  $('#formDirector').value = movie.director || '';
  $('#formNotes').value = movie.notes || '';
  $('#tmdbSearch').value = '';
  $('#tmdbResults').innerHTML = '';
  $('#tmdbHint').classList.add('hidden');

  // Show poster preview if exists
  const url = posterUrl(movie);
  if (url) {
    $('#previewPoster').src = url;
    $('#previewRow').classList.remove('hidden');
  } else {
    $('#previewRow').classList.add('hidden');
  }

  renderFormStars();
  renderFormStatus();
  renderFormTags();
  $('#modalOverlay').classList.remove('hidden');
  $('#formTitle').focus();
}

function closeModal() {
  $('#modalOverlay').classList.add('hidden');
  state.editingId = null;
}

// ── Form Stars ───────────────────────────────────────
function renderFormStars() {
  $$('#formStars .star').forEach(star => {
    star.classList.toggle('active', Number(star.dataset.value) <= state.formRating);
  });
}

$('#formStars').addEventListener('click', (e) => {
  const star = e.target.closest('.star');
  if (!star) return;
  state.formRating = Number(star.dataset.value);
  renderFormStars();
});

$('#formStars').addEventListener('mouseover', (e) => {
  const star = e.target.closest('.star');
  if (!star) return;
  const val = Number(star.dataset.value);
  $$('#formStars .star').forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= val));
});

$('#formStars').addEventListener('mouseleave', renderFormStars);

// ── Form Status ──────────────────────────────────────
function renderFormStatus() {
  $$('#formStatus .status-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.status === state.formStatus);
  });
}

$('#formStatus').addEventListener('click', (e) => {
  const opt = e.target.closest('.status-option');
  if (!opt) return;
  state.formStatus = opt.dataset.status;
  renderFormStatus();
});

// ── Form Tags ────────────────────────────────────────
function renderFormTags() {
  const list = $('#formTagsList');
  list.innerHTML = '';
  state.formTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${escapeHtml(tag)} <button type="button" class="tag-pill-remove" data-tag="${escapeHtml(tag)}">✕</button>`;
    list.appendChild(pill);
  });
}

$('#formTagsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-pill-remove');
  if (!btn) return;
  state.formTags = state.formTags.filter(t => t !== btn.dataset.tag);
  renderFormTags();
});

$('#formTags').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const val = $('#formTags').value.trim();
    if (!val || state.formTags.includes(val)) { $('#formTags').value = ''; return; }
    state.formTags.push(val);
    $('#formTags').value = '';
    renderFormTags();
  }
});

// ── Form Submit ──────────────────────────────────────
$('#movieForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#formTitle').value.trim();
  if (!title) return showToast('请输入电影名称', true);

  const data = {
    title,
    year: $('#formYear').value ? Number($('#formYear').value) : null,
    director: $('#formDirector').value.trim(),
    rating: state.formRating,
    status: state.formStatus,
    notes: $('#formNotes').value.trim(),
    tags: state.formTags,
    poster_path: state.tmdbPosterPath || '',
    tmdb_id: state.tmdbId || null,
  };

  try {
    if (state.editingId) {
      await api(`/api/movies/${state.editingId}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('已更新');
    } else {
      await api(`/api/lists/${state.currentListId}/movies`, { method: 'POST', body: JSON.stringify(data) });
      showToast('已添加');
    }
    closeModal();
    await loadMovies();
  } catch (err) {
    showToast(err.message || '保存失败', true);
  }
});

// ── Search ───────────────────────────────────────────
let searchTimer;
$('#searchInput').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.filters.search = $('#searchInput').value.trim();
    loadMovies();
  }, 300);
});

// ── Status Filter ────────────────────────────────────
$('.filter-group').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip');
  if (!chip) return;
  $$('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.filters.status = chip.dataset.status;
  loadMovies();
});

// ── Sort ─────────────────────────────────────────────
$('#sortSelect').addEventListener('change', () => {
  state.filters.sort = $('#sortSelect').value;
  loadMovies();
});

// ── Tag Filter ───────────────────────────────────────
function filterByTag(tag) {
  state.filters.tag = tag;
  loadMovies();
}

function updateTagFilterUI() {
  if (state.filters.tag) {
    $('#activeTagFilter').classList.remove('hidden');
    $('#activeTagName').textContent = state.filters.tag;
  } else {
    $('#activeTagFilter').classList.add('hidden');
  }
}

$('#clearTagFilter').addEventListener('click', () => {
  state.filters.tag = null;
  loadMovies();
});

// ── Toast ────────────────────────────────────────────
let toastTimer;
function showToast(msg, isError = false) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.borderColor = isError ? 'var(--danger-dim)' : 'var(--gold-dim)';
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ── Utils ────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Event Wiring ─────────────────────────────────────
function setupEvents() {
  // Modal open/close
  $('#addBtn').addEventListener('click', openAddModal);
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) closeModal(); });

  // Settings
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsCancel').addEventListener('click', closeSettings);
  $('#settingsOverlay').addEventListener('click', (e) => { if (e.target === $('#settingsOverlay')) closeSettings(); });

  // TMDB go-to-settings link
  $('#tmdbGoSettings').addEventListener('click', () => { closeModal(); openSettings(); });

  // List modal
  $('#sidebarAddBtn').addEventListener('click', openNewListModal);
  $('#editListBtn').addEventListener('click', openEditListModal);
  $('#deleteListBtn').addEventListener('click', deleteCurrentList);
  $('#listModalClose').addEventListener('click', closeListModal);
  $('#listModalCancel').addEventListener('click', closeListModal);
  $('#listModalOverlay').addEventListener('click', (e) => { if (e.target === $('#listModalOverlay')) closeListModal(); });

  // Escape to close modals
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modalOverlay').classList.contains('hidden')) closeModal();
    else if (!$('#settingsOverlay').classList.contains('hidden')) closeSettings();
    else if (!$('#listModalOverlay').classList.contains('hidden')) closeListModal();
  });
}

// ── Boot ─────────────────────────────────────────────
init();

/* ═══════════════════════════════════════════════════════
   CC 铁皮电影盘 · APP v3
   TMDB 即搜即加 + 多片单
   ═══════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const TMDB_SEARCH_URL = 'https://api.themoviedb.org/3/search/movie';
let tmdbKey = localStorage.getItem('tmdb_api_key') || '';

// ── State ────────────────────────────────────────────
const state = {
  lists: [],
  currentListId: null,
  movies: [],
  allTags: [],
  filters: { listSearch: '', status: 'all', tag: null, sort: 'created_at' },
  editingId: null,
  formTags: [],
  formRating: 0,
  formStatus: 'watched',
  // Track which TMDB IDs are already in current list
  existingTmdbIds: new Set(),
};

// ── API ──────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
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
      await api('/api/lists', { method: 'POST', body: JSON.stringify({ name: '我的片单' }) });
      state.lists = await api('/api/lists');
    }
    const savedId = Number(localStorage.getItem('current_list_id'));
    state.currentListId = (savedId && state.lists.find(l => l.id === savedId))
      ? savedId : state.lists[0].id;
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
    item.innerHTML = `<span class="sidebar-item-name">${esc(list.name)}</span><span class="sidebar-item-count"></span>`;
    item.addEventListener('click', () => switchList(list.id));
    nav.appendChild(item);
  });
}

async function switchList(listId) {
  if (listId === state.currentListId) return;
  state.currentListId = listId;
  state.filters = { listSearch: '', status: 'all', tag: null, sort: 'created_at' };
  localStorage.setItem('current_list_id', listId);
  renderSidebar();
  resetToolbar();
  await loadMovies();
}

function resetToolbar() {
  $('#listSearch').value = '';
  $$('.filter-chip').forEach(c => c.classList.remove('active'));
  $('.filter-chip[data-status="all"]').classList.add('active');
  $('#sortSelect').value = 'created_at';
  $('#activeTagFilter').classList.add('hidden');
}

// ── List CRUD ────────────────────────────────────────
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

function closeListModal() { $('#listModalOverlay').classList.add('hidden'); }

$('#listForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#listFormName').value.trim();
  if (!name) return showToast('请输入片单名称', true);
  const desc = $('#listFormDesc').value.trim();
  const id = $('#listFormId').value;
  try {
    if (id) {
      await api(`/api/lists/${id}`, { method: 'PUT', body: JSON.stringify({ name, description: desc }) });
    } else {
      const created = await api('/api/lists', { method: 'POST', body: JSON.stringify({ name, description: desc }) });
      state.currentListId = created.id;
      localStorage.setItem('current_list_id', created.id);
    }
    closeListModal();
    state.lists = await api('/api/lists');
    renderSidebar();
    resetToolbar();
    await loadMovies();
    showToast(id ? '片单已更新' : '片单已创建');
  } catch (err) { showToast(err.message, true); }
});

async function deleteCurrentList() {
  const list = state.lists.find(l => l.id === state.currentListId);
  if (!list) return;
  if (!confirm(`确定删除「${list.name}」？片单内所有电影也会被删除。`)) return;
  try {
    await api(`/api/lists/${state.currentListId}`, { method: 'DELETE' });
    state.lists = await api('/api/lists');
    state.currentListId = state.lists[0]?.id;
    if (state.currentListId) localStorage.setItem('current_list_id', state.currentListId);
    renderSidebar();
    resetToolbar();
    await loadMovies();
    showToast('片单已删除');
  } catch (err) { showToast(err.message, true); }
}

// ── Load Movies ──────────────────────────────────────
async function loadMovies() {
  if (!state.currentListId) return;
  try {
    const params = new URLSearchParams();
    if (state.filters.listSearch) params.set('search', state.filters.listSearch);
    if (state.filters.status !== 'all') params.set('status', state.filters.status);
    if (state.filters.tag) params.set('tag', state.filters.tag);
    if (state.filters.sort) params.set('sort', state.filters.sort);

    state.movies = await api(`/api/lists/${state.currentListId}/movies?${params}`);
    state.allTags = await api(`/api/lists/${state.currentListId}/tags`);

    // Build set of existing TMDB IDs for dedup
    state.existingTmdbIds = new Set();
    state.movies.forEach(m => { if (m.tmdb_id) state.existingTmdbIds.add(m.tmdb_id); });

    render();
  } catch (err) { showToast('加载失败', true); }
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
}

// ── Movie Card ───────────────────────────────────────
function createMovieCard(movie, index) {
  const card = document.createElement('div');
  card.className = 'movie-card';
  card.style.animationDelay = `${index * 0.04}s`;
  card.dataset.id = movie.id;

  const poster = document.createElement('div');
  poster.className = 'card-poster';
  const url = posterUrl(movie);
  if (url) {
    const img = document.createElement('img');
    img.src = url; img.alt = movie.title; img.loading = 'lazy';
    img.onerror = () => { img.remove(); poster.appendChild(placeholderEl()); };
    poster.appendChild(img);
  } else { poster.appendChild(placeholderEl()); }

  const body = document.createElement('div');
  body.className = 'card-body';

  const titleRow = document.createElement('div');
  titleRow.className = 'card-title-row';
  const h3 = document.createElement('h3');
  h3.className = 'card-title'; h3.textContent = movie.title;
  const yr = document.createElement('span');
  yr.className = 'card-year'; yr.textContent = movie.year || '—';
  titleRow.appendChild(h3); titleRow.appendChild(yr);

  const dir = document.createElement('p');
  dir.className = 'card-director'; dir.textContent = movie.director || '';

  const stars = document.createElement('div');
  stars.className = 'card-stars';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.className = 'card-star' + (i <= movie.rating ? ' filled' : '');
    s.textContent = '★'; stars.appendChild(s);
  }

  const status = document.createElement('span');
  status.className = `card-status ${movie.status}`;
  status.textContent = movie.status === 'watched' ? '已看' : '想看';

  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'card-tags';
  (Array.isArray(movie.tags) ? movie.tags : []).forEach(tag => {
    const chip = document.createElement('span');
    chip.className = 'card-tag'; chip.textContent = tag;
    chip.addEventListener('click', (e) => { e.stopPropagation(); filterByTag(tag); });
    tagsDiv.appendChild(chip);
  });

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const editBtn = document.createElement('button');
  editBtn.className = 'card-action'; editBtn.textContent = '编辑';
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(movie); });
  const delBtn = document.createElement('button');
  delBtn.className = 'card-action delete'; delBtn.textContent = '删除';
  delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteMovie(movie.id); });
  actions.appendChild(editBtn); actions.appendChild(delBtn);

  body.appendChild(titleRow);
  if (movie.director) body.appendChild(dir);
  body.appendChild(stars);
  body.appendChild(status);
  if (movie.tags?.length) body.appendChild(tagsDiv);
  body.appendChild(actions);
  card.appendChild(poster); card.appendChild(body);
  return card;
}

function placeholderEl() {
  const d = document.createElement('div');
  d.className = 'card-poster-placeholder';
  d.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span>NO ARTWORK</span>`;
  return d;
}

async function deleteMovie(id) {
  if (!confirm('确定删除？')) return;
  try {
    await api(`/api/movies/${id}`, { method: 'DELETE' });
    showToast('已删除'); await loadMovies();
  } catch (err) { showToast('删除失败', true); }
}

// ═══════════════════════════════════════════════════════
//  TMDB SEARCH (main bar)
// ═══════════════════════════════════════════════════════

let tmdbTimer;
const tmdbSearchInput = $('#tmdbSearch');
const tmdbDropdown = $('#tmdbDropdown');
const tmdbHint = $('#tmdbHint');

tmdbSearchInput.addEventListener('input', () => {
  clearTimeout(tmdbTimer);
  const q = tmdbSearchInput.value.trim();
  if (!q) { closeDropdown(); return; }
  if (!tmdbKey) {
    tmdbHint.classList.remove('hidden');
    tmdbDropdown.classList.remove('active');
    return;
  }
  tmdbHint.classList.add('hidden');
  tmdbTimer = setTimeout(() => searchTMDB(q), 350);
});

tmdbSearchInput.addEventListener('focus', () => {
  const q = tmdbSearchInput.value.trim();
  if (q && tmdbKey && tmdbDropdown.children.length > 0) {
    tmdbDropdown.classList.add('active');
  }
});

async function searchTMDB(query) {
  if (query.length < 2) { closeDropdown(); return; }

  try {
    const url = `${TMDB_SEARCH_URL}?api_key=${tmdbKey}&query=${encodeURIComponent(query)}&language=zh-CN&page=1`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 401) tmdbDropdown.innerHTML = '<div class="tmdb-dropdown-error">API Key 无效，请检查设置</div>';
      else tmdbDropdown.innerHTML = '<div class="tmdb-dropdown-error">搜索失败，请稍后重试</div>';
      tmdbDropdown.classList.add('active');
      return;
    }
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      tmdbDropdown.innerHTML = '<div class="tmdb-dropdown-empty">未找到匹配电影</div>';
      tmdbDropdown.classList.add('active');
      return;
    }

    tmdbDropdown.innerHTML = data.results.slice(0, 8).map(m => {
      const alreadyAdded = state.existingTmdbIds.has(m.id);
      const posterHtml = m.poster_path
        ? `<img class="tmdb-dropdown-poster" src="${TMDB_IMAGE_BASE}${m.poster_path}" alt="" loading="lazy">`
        : '<div class="tmdb-dropdown-noposter">🎬</div>';
      const year = m.release_date ? m.release_date.slice(0, 4) : '';
      const btnClass = alreadyAdded ? 'tmdb-add-btn added' : 'tmdb-add-btn';
      const btnText = alreadyAdded ? '✓ 已收藏' : '＋添加';

      return `
        <div class="tmdb-dropdown-item" data-tmdb-id="${m.id}" data-title="${esc(m.title)}" data-year="${year}" data-poster="${m.poster_path || ''}" data-overview="${esc(m.overview || '')}">
          ${posterHtml}
          <div class="tmdb-dropdown-info">
            <span class="tmdb-dropdown-title">${esc(m.title)}${year ? `<span class="tmdb-dropdown-year">${year}</span>` : ''}</span>
            <div class="tmdb-dropdown-overview">${esc((m.overview || '').slice(0, 80))}</div>
          </div>
          <button class="${btnClass}" data-action="add" ${alreadyAdded ? 'disabled' : ''}>${btnText}</button>
        </div>
      `;
    }).join('');

    tmdbDropdown.classList.add('active');
  } catch (err) {
    tmdbDropdown.innerHTML = '<div class="tmdb-dropdown-error">网络错误</div>';
    tmdbDropdown.classList.add('active');
  }
}

// Click: add movie to current list
tmdbDropdown.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="add"]');
  if (!btn || btn.classList.contains('added')) return;

  const item = btn.closest('.tmdb-dropdown-item');
  if (!item) return;

  const title = item.dataset.title;
  const year = item.dataset.year || null;
  const posterPath = item.dataset.poster || '';
  const tmdbId = Number(item.dataset.tmdbId);

  btn.textContent = '添加中…';
  btn.disabled = true;

  try {
    await api(`/api/lists/${state.currentListId}/movies`, {
      method: 'POST',
      body: JSON.stringify({
        title,
        year: year ? Number(year) : null,
        poster_path: posterPath,
        tmdb_id: tmdbId,
        rating: 0,
        status: 'want_to_watch',
        tags: [],
      }),
    });
    showToast(`已添加《${title}》`);
    btn.classList.add('added');
    btn.textContent = '✓ 已收藏';
    state.existingTmdbIds.add(tmdbId);
    await loadMovies();
  } catch (err) {
    showToast(err.message || '添加失败', true);
    btn.textContent = '＋添加';
    btn.disabled = false;
  }
});

function closeDropdown() {
  tmdbDropdown.classList.remove('active');
  tmdbDropdown.innerHTML = '';
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#tmdbSearchWrap') && !e.target.closest('#tmdbDropdown')) {
    closeDropdown();
  }
});

// ═══════════════════════════════════════════════════════
//  IN-LIST SEARCH
// ═══════════════════════════════════════════════════════

let listSearchTimer;
$('#listSearch').addEventListener('input', () => {
  clearTimeout(listSearchTimer);
  listSearchTimer = setTimeout(() => {
    state.filters.listSearch = $('#listSearch').value.trim();
    loadMovies();
  }, 250);
});

// ═══════════════════════════════════════════════════════
//  MODAL (manual add / edit)
// ═══════════════════════════════════════════════════════

function openAddModal() {
  state.editingId = null;
  state.formTags = [];
  state.formRating = 0;
  state.formStatus = 'watched';
  $('#modalTitle').textContent = '手动添加电影';
  $('#movieForm').reset();
  $('#formMovieId').value = '';
  $('#formYear').value = '';
  renderFormStars();
  renderFormStatus();
  renderFormTags();
  $('#modalOverlay').classList.remove('hidden');
  $('#formTitle').focus();
}

function openEditModal(movie) {
  state.editingId = movie.id;
  state.formTags = Array.isArray(movie.tags) ? [...movie.tags] : [];
  state.formRating = movie.rating || 0;
  state.formStatus = movie.status || 'watched';
  $('#modalTitle').textContent = '编辑电影';
  $('#formMovieId').value = movie.id;
  $('#formTitle').value = movie.title;
  $('#formYear').value = movie.year || '';
  $('#formDirector').value = movie.director || '';
  $('#formNotes').value = movie.notes || '';
  renderFormStars();
  renderFormStatus();
  renderFormTags();
  $('#modalOverlay').classList.remove('hidden');
  $('#formTitle').focus();
}

function closeModal() { $('#modalOverlay').classList.add('hidden'); state.editingId = null; }

// Stars
function renderFormStars() {
  $$('#formStars .star').forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= state.formRating));
}
$('#formStars').addEventListener('click', (e) => {
  const star = e.target.closest('.star'); if (!star) return;
  state.formRating = Number(star.dataset.value); renderFormStars();
});
$('#formStars').addEventListener('mouseover', (e) => {
  const star = e.target.closest('.star'); if (!star) return;
  $$('#formStars .star').forEach(s => s.classList.toggle('active', Number(s.dataset.value) <= Number(star.dataset.value)));
});
$('#formStars').addEventListener('mouseleave', renderFormStars);

// Status
function renderFormStatus() {
  $$('#formStatus .status-option').forEach(o => o.classList.toggle('active', o.dataset.status === state.formStatus));
}
$('#formStatus').addEventListener('click', (e) => {
  const opt = e.target.closest('.status-option'); if (!opt) return;
  state.formStatus = opt.dataset.status; renderFormStatus();
});

// Tags
function renderFormTags() {
  const list = $('#formTagsList'); list.innerHTML = '';
  state.formTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${esc(tag)} <button type="button" class="tag-pill-remove" data-tag="${esc(tag)}">✕</button>`;
    list.appendChild(pill);
  });
}
$('#formTagsList').addEventListener('click', (e) => {
  const btn = e.target.closest('.tag-pill-remove'); if (!btn) return;
  state.formTags = state.formTags.filter(t => t !== btn.dataset.tag); renderFormTags();
});
$('#formTags').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const val = $('#formTags').value.trim();
  if (!val || state.formTags.includes(val)) { $('#formTags').value = ''; return; }
  state.formTags.push(val); $('#formTags').value = ''; renderFormTags();
});

// Submit
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
    poster_path: '',
    tmdb_id: null,
  };
  try {
    if (state.editingId) {
      await api(`/api/movies/${state.editingId}`, { method: 'PUT', body: JSON.stringify(data) });
      showToast('已更新');
    } else {
      await api(`/api/lists/${state.currentListId}/movies`, { method: 'POST', body: JSON.stringify(data) });
      showToast('已添加');
    }
    closeModal(); await loadMovies();
  } catch (err) { showToast(err.message || '保存失败', true); }
});

// ═══════════════════════════════════════════════════════
//  FILTERS & SORT
// ═══════════════════════════════════════════════════════

$('.filter-group').addEventListener('click', (e) => {
  const chip = e.target.closest('.filter-chip'); if (!chip) return;
  $$('.filter-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  state.filters.status = chip.dataset.status;
  loadMovies();
});

$('#sortSelect').addEventListener('change', () => {
  state.filters.sort = $('#sortSelect').value;
  loadMovies();
});

function filterByTag(tag) { state.filters.tag = tag; loadMovies(); }

function updateTagFilterUI() {
  if (state.filters.tag) {
    $('#activeTagFilter').classList.remove('hidden');
    $('#activeTagName').textContent = state.filters.tag;
  } else { $('#activeTagFilter').classList.add('hidden'); }
}

$('#clearTagFilter').addEventListener('click', () => { state.filters.tag = null; loadMovies(); });

// ═══════════════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════════════

function openSettings() {
  $('#apiKeyInput').value = tmdbKey;
  $('#settingsStatus').textContent = '';
  $('#settingsOverlay').classList.remove('hidden');
}
function closeSettings() { $('#settingsOverlay').classList.add('hidden'); }

$('#settingsSave').addEventListener('click', () => {
  const val = $('#apiKeyInput').value.trim();
  if (!val) { $('#settingsStatus').textContent = '请输入 API Key'; return; }
  tmdbKey = val;
  localStorage.setItem('tmdb_api_key', val);
  $('#settingsStatus').textContent = '✅ API Key 已保存';
  setTimeout(closeSettings, 800);
});

// ═══════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════

let toastTimer;
function showToast(msg, isErr = false) {
  clearTimeout(toastTimer);
  const el = $('#toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.borderColor = isErr ? 'var(--danger-dim)' : 'var(--gold-dim)';
  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

// ═══════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════

function esc(str) {
  const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
}

// ═══════════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════════

function setupEvents() {
  // Add movie (manual)
  $('#addBtnManual').addEventListener('click', openAddModal);
  // Modal
  $('#modalClose').addEventListener('click', closeModal);
  $('#modalCancel').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) closeModal(); });
  // Settings
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsClose').addEventListener('click', closeSettings);
  $('#settingsCancel').addEventListener('click', closeSettings);
  $('#settingsOverlay').addEventListener('click', (e) => { if (e.target === $('#settingsOverlay')) closeSettings(); });
  // TMDB → settings link
  $('#tmdbGoSettings').addEventListener('click', () => { closeDropdown(); openSettings(); });
  // List modals
  $('#sidebarAddBtn').addEventListener('click', openNewListModal);
  $('#editListBtn').addEventListener('click', openEditListModal);
  $('#deleteListBtn').addEventListener('click', deleteCurrentList);
  $('#listModalClose').addEventListener('click', closeListModal);
  $('#listModalCancel').addEventListener('click', closeListModal);
  $('#listModalOverlay').addEventListener('click', (e) => { if (e.target === $('#listModalOverlay')) closeListModal(); });
  // Escape
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modalOverlay').classList.contains('hidden')) closeModal();
    else if (!$('#settingsOverlay').classList.contains('hidden')) closeSettings();
    else if (!$('#listModalOverlay').classList.contains('hidden')) closeListModal();
    else closeDropdown();
  });
}

init();

import { $ } from './dom.js';

let toastTimer;

export function showToast(message, isError = false) {
  clearTimeout(toastTimer);

  const el = $('#toast');
  el.textContent = message;
  el.classList.remove('hidden');
  el.style.borderColor = isError ? 'var(--danger-dim)' : 'var(--red-dim)';

  toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
}

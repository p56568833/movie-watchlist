import { esc } from './utils.js';

let deletePopover = null;
let deletePopoverTarget = null;

function ensureDeletePopover() {
  if (deletePopover) return;

  deletePopover = document.createElement('div');
  deletePopover.className = 'delete-popover';
  deletePopover.innerHTML = `
    <div class="delete-popover-text"></div>
    <div class="delete-popover-actions">
      <button class="delete-popover-btn cancel">取消</button>
      <button class="delete-popover-btn confirm">确认删除</button>
    </div>
  `;
  document.body.appendChild(deletePopover);

  deletePopover.querySelector('.cancel').addEventListener('click', closeDeletePopover);
}

export function showDeletePopover(button, movie, onConfirm) {
  ensureDeletePopover();
  closeDeletePopover();

  deletePopoverTarget = movie;
  deletePopover.querySelector('.delete-popover-text').innerHTML =
    `确定删除 <strong>《${esc(movie.title)}》</strong>？`;

  const confirmBtn = deletePopover.querySelector('.confirm');
  confirmBtn.onclick = async () => {
    closeDeletePopover();
    await onConfirm(movie);
  };

  const rect = button.getBoundingClientRect();
  const popoverWidth = 220;
  let left = rect.left - popoverWidth + rect.width / 2;
  let top = rect.bottom + 8;

  if (left < 8) left = 8;
  if (left + popoverWidth > window.innerWidth - 8) {
    left = window.innerWidth - popoverWidth - 8;
  }
  if (top + 100 > window.innerHeight) top = rect.top - 100;

  deletePopover.style.left = `${left}px`;
  deletePopover.style.top = `${top}px`;
  deletePopover.classList.add('active');
}

function closeDeletePopover() {
  if (!deletePopover) return;
  deletePopover.classList.remove('active');
  deletePopoverTarget = null;
}

export function initDeletePopover() {
  document.addEventListener('click', (event) => {
    if (!deletePopover || !deletePopover.classList.contains('active')) return;
    if (!deletePopover.contains(event.target) && !event.target.closest('.card-delete-btn')) {
      closeDeletePopover();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && deletePopover?.classList.contains('active')) {
      closeDeletePopover();
    }
  });
}

import { $ } from './dom.js';

let _onConfirm = null;

/**
 * 初始化删除确认弹窗（仅绑定一次）
 * 替代 detailPanel.js 和 lists.js 各自绑定 #deleteConfirmOverlay 处理器的旧方案
 */
export function initDeleteConfirm() {
  $('#deleteConfirmCancel').addEventListener('click', closeDeleteConfirm);
  $('#deleteConfirmBtn').addEventListener('click', async () => {
    if (!_onConfirm) return;
    const fn = _onConfirm;
    closeDeleteConfirm();
    try { await fn(); } catch { /* callback 自行处理错误 */ }
  });
}

/**
 * 显示删除确认弹窗
 * @param {string} html - 确认文案（可含 HTML）
 * @param {() => void | Promise<void>} onConfirm - 点击"确认删除"后的回调
 */
export function showDeleteConfirm(html, onConfirm) {
  $('#deleteConfirmText').innerHTML = html;
  _onConfirm = onConfirm;
  $('#deleteConfirmOverlay').classList.remove('hidden');
}

export function closeDeleteConfirm() {
  $('#deleteConfirmOverlay').classList.add('hidden');
  _onConfirm = null;
}

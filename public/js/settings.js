import { $ } from './dom.js';
import { getState, setTmdbKey } from './state.js';

export function openSettings() {
  $('#apiKeyInput').value = getState().tmdbKey;
  $('#settingsStatus').textContent = '';
  $('#settingsOverlay').classList.remove('hidden');
}

export function closeSettings() {
  $('#settingsOverlay').classList.add('hidden');
}

export function initSettings() {
  $('#settingsSave').addEventListener('click', () => {
    const value = $('#apiKeyInput').value.trim();
    if (!value) {
      $('#settingsStatus').textContent = '请输入 API Key';
      return;
    }

    setTmdbKey(value);
    $('#settingsStatus').textContent = '✓ API Key 已保存';
    setTimeout(closeSettings, 800);
  });
}

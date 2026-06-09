export async function api(path, options = {}) {
  let res;

  try {
    res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
  } catch (err) {
    console.error('API fetch error:', err);
    throw new Error('网络连接失败，请检查 WiFi 或刷新重试');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `请求失败 (${res.status})`);
  }

  return res.json();
}

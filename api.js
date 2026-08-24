/**
 * Shared connection to the Nova Social worker.
 *
 * GitHub Pages is public and static, so the internal key cannot live in this
 * repository. It is supplied once at runtime — `?key=…` in the URL, or the
 * prompt below — and kept in sessionStorage for that tab only. The key is
 * stripped from the address bar immediately so it does not sit in history or
 * get pasted into a screenshot.
 */
const NOVA = (() => {
  const STORE = 'nova.social.cfg';
  const DEFAULT_URL = 'https://nova-social-worker-dev.thanukamax321.workers.dev';
  const BRAND = 'brand_kandos_demo';

  let cfg = {};
  try { cfg = JSON.parse(sessionStorage.getItem(STORE) || '{}'); } catch { cfg = {}; }

  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('key');
  if (fromUrl) {
    cfg = { key: fromUrl.trim(), url: (url.searchParams.get('api') || cfg.url || DEFAULT_URL).replace(/\/$/, '') };
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ }
    url.searchParams.delete('key'); url.searchParams.delete('api');
    history.replaceState(null, '', url.toString());
  }

  const live = () => Boolean(cfg.key);

  async function call(path, init = {}) {
    if (!live()) throw new Error('no key');
    const res = await fetch(`${cfg.url || DEFAULT_URL}${path}`, {
      ...init,
      headers: { ...(init.headers || {}), 'x-nova-key': cfg.key, 'Content-Type': 'application/json' },
    });
    if (res.status === 401) throw new Error('The worker rejected that key.');
    if (res.status === 429) throw new Error('Rate limited — wait a minute and try again.');
    if (!res.ok) throw new Error(`The worker answered ${res.status}.`);
    return res.json();
  }

  function promptForKey() {
    const k = window.prompt('Paste the worker key to run live (64 hex characters). Cancel to stay on captured data.');
    if (!k) return false;
    cfg = { key: k.trim(), url: cfg.url || DEFAULT_URL };
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* ignore */ }
    return true;
  }

  return { live, call, promptForKey, brandId: BRAND, get url() { return cfg.url || DEFAULT_URL; } };
})();

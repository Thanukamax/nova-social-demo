/**
 * Shared connection to the Nova Social worker.
 *
 * GitHub Pages is public and static, so the internal key cannot live in this
 * repository. It is supplied once at runtime and kept in sessionStorage for
 * that tab only.
 *
 * Prefer `#key=…`. A query string is sent to GitHub's servers with the document
 * request and again as the Referer of every subresource, so `?key=…` is in
 * someone else's access log before this file has run. A fragment never leaves
 * the browser. `?key=` still works because links to it exist, but it is
 * upgraded to the fragment form and the page says so.
 */
const NOVA = (() => {
  const STORE = 'nova.social.cfg';
  const DEFAULT_URL = 'https://nova-social-worker-dev.thanukamax321.workers.dev';
  const BRAND = 'brand_kandos_demo';
  const TIMEOUT_MS = 20000;

  /**
   * `JSON.parse('null')` succeeds and returns null, so the usual
   * `JSON.parse(x || '{}')` inside a try/catch lets a stored "null" through and
   * every later property read throws. Accept only a plain object.
   */
  const asObject = (raw) => {
    try {
      const parsed = JSON.parse(raw || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  let cfg = {};
  try { cfg = asObject(sessionStorage.getItem(STORE)); } catch { cfg = {}; }

  const url = new URL(location.href);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const fromHash = hash.get('key');
  const fromQuery = url.searchParams.get('key');
  const fromUrl = fromHash || fromQuery;

  if (fromUrl) {
    const api = hash.get('api') || url.searchParams.get('api') || cfg.url || DEFAULT_URL;
    cfg = { key: fromUrl.trim(), url: api.replace(/\/$/, '') };
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ }
    url.searchParams.delete('key'); url.searchParams.delete('api');
    hash.delete('key'); hash.delete('api');
    const rest = hash.toString();
    url.hash = rest ? `#${rest}` : '';
    history.replaceState(null, '', url.toString());
  }

  const live = () => Boolean(cfg.key);

  /* ---- status line ------------------------------------------------- */

  const style = document.createElement('style');
  style.textContent = `
    #novaStatus{position:fixed;left:50%;transform:translateX(-50%);bottom:16px;z-index:80;
      max-width:min(560px,92vw);background:#0F0F14;color:#FFFFFF;border-radius:12px;
      padding:11px 16px;font-size:13px;line-height:1.5;font-family:inherit;
      box-shadow:0 12px 40px rgba(15,15,20,.28)}
    #novaStatus[hidden]{display:none!important}
  `;
  document.head.appendChild(style);

  let statusEl = null;
  let statusTimer = null;

  /**
   * A rejected key used to be invisible: the fetch failed, the page kept the
   * design's figures and nothing said so. Any worker problem now says itself.
   */
  function notice(message, ms = 8000) {
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'novaStatus';
      statusEl.setAttribute('role', 'status');
      document.body.appendChild(statusEl);
    }
    statusEl.textContent = message;
    statusEl.hidden = false;
    clearTimeout(statusTimer);
    if (ms) statusTimer = setTimeout(() => { statusEl.hidden = true; }, ms);
  }

  async function call(path, init = {}) {
    if (!live()) throw new Error('no key');

    // A worker that never answers used to park the caller on a loading step
    // forever, because nothing else was going to fire.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${cfg.url || DEFAULT_URL}${path}`, {
        ...init,
        signal: abort.signal,
        headers: { ...(init.headers || {}), 'x-nova-key': cfg.key, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      throw new Error(abort.signal.aborted ? 'The worker did not answer in time.' : 'The worker could not be reached.');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) throw new Error('The worker rejected that key.');
    if (res.status === 429) throw new Error('Rate limited — wait a minute and try again.');
    if (!res.ok) throw new Error(`The worker answered ${res.status}.`);
    try {
      return await res.json();
    } catch {
      throw new Error('The worker answered with something that is not JSON.');
    }
  }

  function promptForKey() {
    const k = window.prompt('Paste the worker key to run live (64 hex characters). Cancel to stay on captured data.');
    if (!k) return false;
    cfg = { key: k.trim(), url: cfg.url || DEFAULT_URL };
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* ignore */ }
    return true;
  }

  if (fromQuery && !fromHash) {
    notice('That key travelled in the URL query, which GitHub Pages logs. Use #key=… next time.', 10000);
  }

  return { live, call, notice, promptForKey, brandId: BRAND, get url() { return cfg.url || DEFAULT_URL; } };
})();

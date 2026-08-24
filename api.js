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
    // Credentials ride the fragment for the same reason the key does: a query
    // string reaches GitHub's access log before this file has run.
    const u = hash.get('u');
    const pw = hash.get('p');
    if (u && pw) { cfg.email = u; cfg.password = pw; }
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ }
    url.searchParams.delete('key'); url.searchParams.delete('api');
    hash.delete('key'); hash.delete('api'); hash.delete('u'); hash.delete('p');
    const rest = hash.toString();
    url.hash = rest ? `#${rest}` : '';
    history.replaceState(null, '', url.toString());
  }

  const live = () => Boolean(cfg.key);
  const signedIn = () => Boolean(cfg.token);

  /**
   * Log in as a brand and keep the session for this tab.
   *
   * The internal key proves the request came from Nova; it does not say WHICH
   * brand is asking. Every /brands/{id}/* route is gated on a session bound to
   * that brand, so the key alone answers 401 — which is exactly what this demo
   * did on every live call once that gate shipped.
   */
  async function login(email, password) {
    const res = await fetch(`${cfg.url || DEFAULT_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'x-nova-key': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) throw new Error('That email and password were not accepted.');
    if (!res.ok) throw new Error(`Sign-in failed — the worker answered ${res.status}.`);

    const body = await res.json();
    cfg.token = body.token;
    // The session is bound to one brand, so the brand the dashboard reads must
    // be the brand that logged in — never the hardcoded default.
    cfg.brandId = body.brandId;
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ }
    return body;
  }

  function signOut() {
    delete cfg.token;
    delete cfg.brandId;
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* ignore */ }
  }

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

  async function call(path, init = {}, retried = false) {
    if (!live()) throw new Error('no key');

    // A session lasts 24h and this tab may outlive it. Rather than fail the
    // call, sign in again from the credentials we already hold.
    if (!signedIn() && cfg.email && cfg.password) {
      try { await login(cfg.email, cfg.password); } catch { /* fall through to 401 */ }
    }

    // A worker that never answers used to park the caller on a loading step
    // forever, because nothing else was going to fire.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${cfg.url || DEFAULT_URL}${path}`, {
        ...init,
        signal: abort.signal,
        headers: {
          ...(init.headers || {}),
          'x-nova-key': cfg.key,
          'Content-Type': 'application/json',
          ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
        },
      });
    } catch (err) {
      throw new Error(abort.signal.aborted ? 'The worker did not answer in time.' : 'The worker could not be reached.');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      // Expired session, not a bad key. Drop it and try once more — a 24h
      // session quietly lapsing must not look like a broken deployment.
      if (!retried && cfg.email && cfg.password) {
        signOut();
        return call(path, init, true);
      }
      throw new Error(
        signedIn() || cfg.email
          ? 'That session is no longer valid — sign in again.'
          : 'Sign in first: this needs a brand session, not just the key.'
      );
    }
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

  return {
    live, call, notice, promptForKey, login, signOut, signedIn,
    // Follows whoever is signed in, falling back to the demo brand so the
    // captured-data pages still render before anyone logs in.
    get brandId() { return cfg.brandId || BRAND; },
    get email() { return cfg.email || ''; },
    get url() { return cfg.url || DEFAULT_URL; },
  };
})();

/**
 * The worker client.
 *
 * There used to be a shared internal key, and the browser could only get it
 * from the URL — `#key=…` pasted into a one-click link. A key in a URL is in a
 * browser history and a referrer log before the page has finished loading, and
 * one leak was a leak for every brand at once.
 *
 * Now nothing here knows a key until someone signs in. The login response
 * carries it: operators get the fixed internal key, brands get one derived for
 * their brand alone. A brand never sees, types or manages its key.
 *
 * The key is not a secret from the person at this browser — anything the page
 * sends is visible in devtools. What it buys is that no secret travels in a
 * URL, that a leaked brand key names the brand it came from, and that a brand
 * key cannot act as an operator.
 */
const NOVA = (() => {
  const STORE = 'nova.social.cfg';
  const DEFAULT_URL = 'https://nova-social-worker-dev.thanukamax321.workers.dev';
  const TIMEOUT_MS = 20000;

  /**
   * `JSON.parse('null')` succeeds and returns null, so the usual
   * `JSON.parse(x || '{}')` inside a try/catch lets a stored "null" through and
   * every later property read throws. Accept only a plain object.
   */
  const asObject = (raw) => {
    try {
      const v = JSON.parse(raw ?? '{}');
      return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };

  let cfg;
  try { cfg = asObject(sessionStorage.getItem(STORE)); } catch { cfg = {}; }

  const persist = () => {
    try { sessionStorage.setItem(STORE, JSON.stringify(cfg)); } catch { /* private mode */ }
  };

  const signedIn = () => Boolean(cfg.token && cfg.key);
  const isAdmin = () => cfg.role === 'admin';

  /**
   * Sign in.
   *
   * Two calls, not one. better-auth issues the session but knows nothing about
   * this worker's internal key, and every route outside its namespace still
   * needs one — so a browser holding only a session can call nothing. The
   * bootstrap call trades the session for the right key: the fixed one for Nova
   * staff, a key derived for their brand alone for everybody else.
   *
   * There is no separate operator login any more. Both kinds of account use
   * this endpoint and are told apart by the role that comes back, which is why
   * one form serves both. Dwayne typing a correct admin password into the brand
   * form used to be answered "that email and password were not accepted".
   */
  async function login(email, password) {
    const base = cfg.url || DEFAULT_URL;

    const res = await fetch(`${base}/api/v1/auth/sign-in/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (res.status === 401) throw new Error('That email and password were not accepted.');
    if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
    if (!res.ok) throw new Error(`Sign-in failed — the worker answered ${res.status}.`);

    // The RAW token from the body, never the signed `set-auth-token` header.
    // Sending the signed one authenticates nobody, and fails as a plain 401
    // that looks exactly like a wrong password.
    const { token } = await res.json();

    const ready = await fetch(`${base}/api/v1/session/bootstrap`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!ready.ok) throw new Error('Signed in, but the worker would not hand over a key.');
    const { apiKey, role, brands } = await ready.json();

    cfg.url = base;
    cfg.token = token;
    cfg.key = apiKey;
    cfg.role = role;
    cfg.email = email;
    cfg.brands = brands;
    // An operator is not scoped to a brand until they open one. Somebody at
    // exactly one brand starts there, because there is nothing to choose.
    cfg.brandId = role === 'admin' ? '' : (brands[0]?.brandId ?? '');
    persist();
    return { token, role, brands };
  }

  function signOut() {
    cfg = { url: cfg.url || DEFAULT_URL };
    persist();
  }

  /** Which brand an operator is currently looking at. */
  function viewBrand(brandId) {
    cfg.brandId = brandId;
    persist();
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
   * A rejected call used to be invisible: the fetch failed, the page kept the
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
    if (!signedIn()) throw new Error('Sign in first.');

    // A worker that never answers used to park the caller on a loading step
    // forever, because nothing else was going to fire.
    const abort = new AbortController();
    /**
     * `/metrics` currently answers in 7 to 14 seconds and weighs two thirds of
     * a megabyte, because it returns each row's whole `raw` provider blob. The
     * flat 20s ceiling meant the dashboard intermittently timed out and drew
     * nothing at all. Callers that know they are asking for something slow can
     * say so, rather than every call paying for the slowest one.
     */
    const timer = setTimeout(() => abort.abort(), init.timeoutMs || TIMEOUT_MS);
    let res;
    try {
      const { timeoutMs, ...rest } = init;
      res = await fetch(`${cfg.url || DEFAULT_URL}${path}`, {
        ...rest,
        signal: abort.signal,
        headers: {
          ...(init.headers || {}),
          'x-nova-key': cfg.key,
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.token}`,
        },
      });
    } catch {
      throw new Error(abort.signal.aborted ? 'The worker did not answer in time.' : 'The worker could not be reached.');
    } finally {
      clearTimeout(timer);
    }

    /**
     * A lapsed session is not a broken deployment, but it cannot be repaired
     * here either. The old client re-logged-in silently, which meant keeping
     * the password in sessionStorage for the lifetime of the tab. Sending the
     * person back to the front door costs one sign-in and stores no password.
     */
    if (res.status === 401) {
      signOut();
      throw new Error('That session has expired. Sign in again.');
    }
    if (res.status === 403) throw new Error('This account cannot open that brand.');

    /**
     * A refusal usually explains itself and the explanation used to be thrown
     * away. `confirm-handle` answers 409 with a `reason` naming exactly why
     * ownership is not proven, and a caller that only saw "the worker answered
     * 409" could not tell an expired claim from a code that is not in the bio.
     * The parsed body rides along on the error so callers can say which.
     */
    if (!res.ok) {
      let detail = null;
      try { detail = await res.clone().json(); } catch { /* not JSON */ }
      const message =
        res.status === 429
          ? 'Rate limited — wait a minute and try again.'
          : detail && detail.error
            ? detail.error
            : `The worker answered ${res.status}.`;
      const err = new Error(message);
      err.status = res.status;
      err.detail = detail;
      throw err;
    }
    try {
      return await res.json();
    } catch {
      throw new Error('The worker answered with something that is not JSON.');
    }
  }

  /**
   * Send anyone without a session back to the front door.
   *
   * Called at the top of every page that reads brand data. The page it was
   * heading for is remembered so signing in resumes it rather than dumping the
   * person on a dashboard they did not ask for.
   */
  function requireSignIn() {
    if (signedIn()) return true;
    try { sessionStorage.setItem('nova.social.next', location.pathname.split('/').pop() || ''); } catch { /* ignore */ }
    location.replace('./');
    return false;
  }

  function consumeNext() {
    try {
      const next = sessionStorage.getItem('nova.social.next');
      sessionStorage.removeItem('nova.social.next');
      return next || '';
    } catch {
      return '';
    }
  }

  return {
    call, notice, login, signOut, signedIn, isAdmin, viewBrand, requireSignIn, consumeNext,
    get brandId() { return cfg.brandId || ''; },
    get brands() { return cfg.brands || []; },
    get email() { return cfg.email || ''; },
    get url() { return cfg.url || DEFAULT_URL; },
  };
})();

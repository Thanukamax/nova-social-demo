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
   * Sign in, without the caller having to know which kind of account this is.
   *
   * Brands live in `brand_accounts` and admins in `admin_users`, behind two
   * different endpoints. Asking the person to pick the right one first is
   * asking them to know the schema: Dwayne typing a correct admin password into
   * the brand form got "that email and password were not accepted", which is
   * true and useless. Try the brand door, then the operator one.
   */
  async function login(email, password) {
    const attempt = async (path) =>
      fetch(`${cfg.url || DEFAULT_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

    let res = await attempt('/api/v1/auth/login');
    let role = 'brand';
    if (res.status === 401) {
      res = await attempt('/api/v1/admin/login');
      role = 'admin';
    }

    if (res.status === 401) throw new Error('That email and password were not accepted.');
    if (res.status === 429) throw new Error('Too many attempts. Wait a minute and try again.');
    if (!res.ok) throw new Error(`Sign-in failed — the worker answered ${res.status}.`);

    const body = await res.json();
    cfg.url = cfg.url || DEFAULT_URL;
    cfg.token = body.token;
    cfg.key = body.apiKey;
    cfg.role = role;
    cfg.email = email;
    // An operator is not scoped to a brand until they open one.
    cfg.brandId = role === 'admin' ? '' : body.brandId;
    persist();
    return { ...body, role };
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
    if (res.status === 429) throw new Error('Rate limited — wait a minute and try again.');
    if (!res.ok) throw new Error(`The worker answered ${res.status}.`);
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
    get email() { return cfg.email || ''; },
    get url() { return cfg.url || DEFAULT_URL; },
  };
})();

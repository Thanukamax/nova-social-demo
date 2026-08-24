/**
 * Brand onboarding demo.
 *
 * Runs on sample data by default. GitHub Pages is public and static, so the
 * worker's internal key cannot live in this file — if you want the real API,
 * paste the key at runtime and it stays in this tab's sessionStorage.
 *
 * The sample figures are real, captured from the live vendor on 2026-08-24, so
 * the demo shows what a brand would actually see rather than invented numbers.
 */
const $ = (id) => document.getElementById(id);
const CFG_KEY = 'nova.demo.cfg';

const SAMPLES = {
  'instagram:daraz.lk': { displayName: 'Daraz Sri Lanka', handle: 'daraz.lk', verified: true,
    followers: 148062, posts: 1240, avgLikes: 708 },
  'instagram:kapruka': { displayName: 'Kapruka', handle: 'kapruka', verified: false,
    followers: 33987, posts: 890, avgLikes: 34 },
  'tiktok:kapruka': { displayName: 'Kapruka', handle: 'kapruka', verified: false,
    followers: 35400, posts: 135, avgLikes: 167 },
  'tiktok:daraz.lk': { displayName: 'Daraz Sri Lanka', handle: 'daraz.lk', verified: false,
    followers: 69100, posts: 467, avgLikes: 19 },
  // The trap this flow exists to catch: a brand entering the worldwide handle.
  'instagram:pizzahut': { displayName: 'Pizza Hut', handle: 'pizzahut', verified: true,
    followers: 1784972, posts: 3100, avgLikes: 1200, global: true },
  'instagram:baskinrobbins': { displayName: 'Baskin-Robbins', handle: 'baskinrobbins', verified: true,
    followers: 807322, posts: 2400, avgLikes: 900, global: true },
};

const SAMPLE_HANDLES = Object.keys(SAMPLES);

let state = { platform: 'instagram', account: null, step: 1 };
let cfg = readCfg();

/**
 * Keys arrive pasted from a terminal, so they often carry the variable name,
 * quotes, or a trailing newline. Stripping those is cheaper than making someone
 * work out why a correct-looking key returns 401.
 */
function cleanKey(raw) {
  return String(raw || '')
    .trim()
    .replace(/^[A-Z_]*KEY\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim();
}

/**
 * A URL pasted without a scheme is the quiet killer: `fetch` treats it as a
 * relative path, so the request goes to this GitHub Pages origin instead of the
 * worker and comes back as a 404 that looks like the API is broken.
 */
function cleanUrl(raw) {
  let v = String(raw || '').trim().replace(/\/+$/, '');
  if (!v) return '';
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/** The worker's key is 64 hex characters. Anything else is a bad paste. */
function keyLooksRight(k) {
  return /^[0-9a-f]{64}$/i.test(k);
}

function readCfg() {
  try { return JSON.parse(sessionStorage.getItem(CFG_KEY) || '{}'); } catch { return {}; }
}
function writeCfg(next) {
  cfg = next;
  try { sessionStorage.setItem(CFG_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  paintMode();
}
function live() { return Boolean(cfg.key && cfg.url); }
function paintMode() {
  $('modeBtn').textContent = live() ? 'live API' : 'sample data';
  const hint = $('modeHint');
  if (hint) {
    hint.textContent = live()
      ? `Live — calling ${cfg.url.replace(/^https?:\/\//, '')}`
      : 'Sample data. Try daraz.lk, kapruka or pizzahut, or add a key via the header.';
  }
}

/** Strip what people actually paste: @ prefixes, full URLs, query strings. */
function normalize(input) {
  let v = String(input || '').trim();
  const m = v.match(/(?:instagram\.com|tiktok\.com|youtube\.com)\/@?([A-Za-z0-9._-]+)/i);
  if (m) v = m[1];
  return v.replace(/^@+/, '').replace(/[/?#].*$/, '').toLowerCase();
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
const initials = (name) => (name || '?').replace(/[^A-Za-z ]/g, '').split(' ')
  .filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/**
 * Move between steps.
 *
 * The outgoing panel gets the shorter duration and the incoming one the longer:
 * a screen should arrive deliberately and leave without ceremony. The timeout
 * matches --dur-out so the two never overlap into a flicker.
 */
function goTo(n) {
  const from = $(`s${state.step}`);
  const to = $(`s${n}`);
  if (from === to) return;

  from.classList.add('leaving');
  from.classList.remove('live');
  setTimeout(() => from.classList.remove('leaving'), 340);
  to.classList.add('live');

  state.step = n;
  ['p1', 'p2', 'p3'].forEach((id, i) => $(id).classList.toggle('on', i < Math.min(n, 3)));
  to.querySelector('h1')?.setAttribute('tabindex', '-1');
  to.querySelector('h1')?.focus?.();
}

async function lookupLive(platform, handle) {
  const res = await fetch(`${cfg.url}/api/v1/brands/demo/verify-handle`, {
    method: 'POST',
    headers: { 'x-nova-key': cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform, handle, companyName: handle }),
  });
  if (res.status === 401) {
    throw new Error('The API rejected that key. Open the header menu and re-paste it — it should be 64 hex characters with no prefix.');
  }
  if (res.status === 429) throw new Error('Too many lookups just now — wait a minute and try again.');
  if (!res.ok) throw new Error(`The API returned ${res.status}.`);
  const body = await res.json();
  if (!body.found) return null;
  return {
    displayName: body.account.displayName || handle,
    handle: body.account.handle,
    verified: Boolean(body.account.verified),
    followers: body.account.followers,
    posts: null,
    avgLikes: null,
    warning: body.account.warning,
  };
}

async function lookupSample(platform, handle) {
  // A deliberate delay: the real call takes seconds, and a demo that answers
  // instantly would hide the one state most likely to feel broken in production.
  await new Promise((r) => setTimeout(r, 1400));
  const hit = SAMPLES[`${platform}:${handle}`];
  if (!hit) return null;
  return {
    ...hit,
    warning: hit.global
      ? `This looks like the global ${hit.displayName} account rather than a Sri Lankan one. If you have a local account, use that instead.`
      : null,
  };
}

async function verify() {
  const handle = normalize($('handle').value);
  $('err1').hidden = true;
  if (!handle) {
    $('err1').textContent = 'Enter a handle first.';
    $('err1').hidden = false;
    return;
  }

  goTo(2);
  $('waitMsg').textContent = live() ? 'Contacting the platform…' : 'Contacting the platform…';

  try {
    // Logged so a failure can be diagnosed from the console rather than guessed at.
    console.info('[nova] lookup', { mode: live() ? 'live' : 'sample', platform: state.platform, handle });

    const account = live()
      ? await lookupLive(state.platform, handle)
      : await lookupSample(state.platform, handle);

    console.info('[nova] result', account);

    if (!account) {
      goTo(1);
      // "Not found" means something different in each mode, and conflating them
      // sent people hunting for a typo when the real answer was "you are on
      // sample data, which only knows a handful of handles".
      $('err1').textContent = live()
        ? `The API looked up @${handle} on ${state.platform} and found no such account.`
        : `Sample data only knows: ${SAMPLE_HANDLES.filter((h) => h.startsWith(state.platform)).map((h) => '@' + h.split(':')[1]).join(', ')}. Add a key via the header to search for real.`;
      $('err1').hidden = false;
      return;
    }

    state.account = account;
    paintAccount(account);
    goTo(3);
  } catch (err) {
    goTo(1);
    $('err1').textContent = err.message || 'Something went wrong. Try again.';
    $('err1').hidden = false;
  }
}

function paintAccount(a) {
  $('av').textContent = initials(a.displayName);
  $('name').textContent = a.displayName;
  $('hnd').textContent = `@${a.handle}`;
  $('vbadge').hidden = !a.verified;
  $('f').textContent = fmt(a.followers);
  $('pc').textContent = fmt(a.posts);
  $('al').textContent = fmt(a.avgLikes);

  // The warning is advice, not a block — a brand may know something we do not.
  $('warnSlot').innerHTML = a.warning
    ? `<div class="warn"><b>Check this one.</b> ${a.warning}</div>`
    : '';
}

function confirm() {
  const a = state.account;
  $('av2').textContent = initials(a.displayName);
  $('name2').textContent = a.displayName;
  $('hnd2').textContent = `@${a.handle}`;
  $('f2').textContent = fmt(a.followers);
  goTo(4);
}

document.querySelectorAll('.plat').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.plat').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    state.platform = b.dataset.plat;
    $('handle').placeholder = state.platform === 'youtube' ? 'novadrop' : 'daraz.lk';
  });
});

$('verifyBtn').addEventListener('click', verify);
$('handle').addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
$('confirmBtn').addEventListener('click', confirm);
$('backBtn').addEventListener('click', () => goTo(1));
$('againBtn').addEventListener('click', () => { $('handle').value = ''; goTo(1); });

$('modeBtn').addEventListener('click', () => {
  $('apiKey').value = cfg.key || '';
  $('apiUrl').value = cfg.url || '';
  $('cfgNote').hidden = true;
  $('cfgState').textContent = cfg.key
    ? `Saved: a ${cfg.key.length}-character key${keyLooksRight(cfg.key) ? '' : ' — that is not the expected 64 hex'}.`
    : 'No key saved — running on sample data.';
  $('cfg').showModal();
});
$('cfgSave').addEventListener('click', async () => {
  const key = cleanKey($('apiKey').value);
  const url = cleanUrl($('apiUrl').value);
  const note = $('cfgNote');
  const say = (msg) => { note.textContent = msg; note.hidden = false; };

  if (!key || !url) return say('Both the key and the worker URL are needed.');
  if (!keyLooksRight(key)) {
    // Caught here rather than as a 401 three screens later.
    return say(`That key is ${key.length} characters; the worker's is 64 hex. Copy everything after "SOCIAL_WORKER_KEY=".`);
  }

  // Verified before saving. Storing settings that do not work and discovering
  // it two screens later is what made this feel like the site was broken.
  say('Checking the connection…');
  const btn = $('cfgSave');
  btn.disabled = true;
  try {
    const res = await fetch(`${url}/api/v1/brands/demo/connections`, { headers: { 'x-nova-key': key } });
    if (res.status === 401) return say('The worker rejected that key. Check you copied all 64 characters.');
    if (!res.ok) return say(`The worker answered ${res.status} at ${url}. Check the URL.`);
  } catch (err) {
    return say(`Could not reach ${url} — ${err.message}. Check the URL is the worker, not this site.`);
  } finally {
    btn.disabled = false;
  }

  note.hidden = true;
  writeCfg({ key, url });
  $('cfg').close();
});
$('cfgClear').addEventListener('click', () => { writeCfg({}); $('cfg').close(); });

paintMode();

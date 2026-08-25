/**
 * Connect flow — the four-step state machine from the design file.
 *
 * Ported from the prototype's own Component logic, not reinterpreted: the same
 * steps, the same 1600ms lookup pause, the same platform tinting. The markup
 * and every inline style come from the design unchanged.
 */

/**
 * Onboarding is not a public page.
 *
 * This wizard was the site's landing page, so social.novadrop.lk opened on
 * "Which account is yours?" — step 1 of 4 of a flow whose every later step
 * needs an account. Anyone arriving cold was being asked to start something
 * they could not finish.
 */
if (!NOVA.requireSignIn()) throw new Error('redirecting to sign-in');

const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

const PLATFORM_TINT = {
  Instagram: { bg: 'rgba(221,42,123,.07)', bd: 'rgba(221,42,123,.45)' },
  TikTok:    { bg: 'rgba(15,15,20,.05)',   bd: 'rgba(15,15,20,.55)' },
  YouTube:   { bg: 'rgba(255,0,0,.06)',    bd: 'rgba(255,0,0,.42)' },
};

/**
 * `mode` is what step 3 is actually showing.
 *
 * It used to have none: step 3 was a fixed card reading "Kandos · verified ·
 * 48,210 followers", and both the success and the failure path landed on it.
 * A handle that does not exist, and a lookup that never answered, both ended
 * with the flow confirming a stranger's account as yours.
 */
/**
 * The dashboard's platform buttons link here with #platform=TikTok and the
 * like. Without this they all landed on Instagram, so three distinct buttons
 * did the same thing and the one you pressed was ignored.
 */
const PLATFORMS = ['Instagram', 'TikTok', 'YouTube'];
const asked = new URLSearchParams(location.hash.replace(/^#/, '')).get('platform');

const state = {
  step: 1,
  handle: 'kandos.lk',
  platform: PLATFORMS.includes(asked) ? asked : 'Instagram',
  warn: false,
  mode: 'sample',       // sample | found | notfound | failed
  account: null,
  error: '',
};
let lookupTimer = null;
let lookupSeq = 0;

const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '—');
const initial = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();

function flags() {
  const onThree = state.step === 3;
  return {
    showWarn: onThree && state.warn,
    showAccount: onThree && (state.mode === 'found' || state.mode === 'sample'),
    showSample: onThree && state.mode === 'sample',
    showNotFound: onThree && state.mode === 'notfound',
    showFailed: onThree && state.mode === 'failed',
  };
}

function paint() {
  const on = flags();
  qa('[data-when]').forEach((el) => {
    const want = el.dataset.when;
    el.hidden = want.startsWith('isStep') ? want !== `isStep${state.step}` : !on[want];
  });

  // Step dots: the design colours the current one and leaves the rest grey.
  qa('[data-action^="step"]').forEach((b, i) => {
    b.style.background = state.step === i + 1 ? '#4F46E5' : '#E8E8EC';
  });

  // Platform buttons carry each network's own tint when selected.
  for (const [name, tint] of Object.entries(PLATFORM_TINT)) {
    const btn = q(`[data-action="pick${name}"]`);
    if (!btn) continue;
    const on = state.platform === name;
    btn.style.background = on ? tint.bg : '#FFFFFF';
    btn.style.borderColor = on ? tint.bd : '#E8E8EC';
  }

  const acct = state.account;
  const bind = {
    handleAt: '@' + (acct?.handle || state.handle || 'yourbrand'),
    platform: state.platform,
    // A captured view has no looked-up account, so it shows the handle that was
    // typed and dashes for everything it did not read. The alternative — the
    // design's figures — is a number presented as this brand's when it is not.
    displayName: acct?.displayName || (state.mode === 'found' ? '—' : state.handle || 'yourbrand'),
    initial: initial(acct?.displayName || state.handle),
    handleLine: `@${acct?.handle || state.handle || 'yourbrand'} · ${state.platform}`,
    followers: acct ? fmt(acct.followers ?? null) : '—',
    // The lookup returns follower count only; post count and location are not
    // part of it, and guessing them would be inventing them.
    posts: '—',
    location: '—',
    lookupError: state.error || 'Something went wrong.',
  };
  qa('[data-bind]').forEach((el) => {
    const v = bind[el.dataset.bind];
    if (v !== undefined) el.textContent = v;
  });
  const tick = q('[data-bind="verifiedTick"]');
  if (tick) tick.hidden = !acct?.verified;
}

const actions = {
  step1: () => go(1), step2: () => go(2), step3: () => go(3), step4: () => go(4),
  pickInstagram: () => { state.platform = 'Instagram'; paint(); },
  pickTikTok:    () => { state.platform = 'TikTok';    paint(); },
  pickYouTube:   () => { state.platform = 'YouTube';   paint(); },
  onBack1:  () => go(1),
  onConfirm: () => go(4),
  goDashboard: () => { window.location.href = './dashboard.html'; },
  onLookup: () => {
    // The pause is the design's: a real lookup takes seconds, and a step that
    // resolves instantly hides the one state most likely to feel broken.
    go(2);
    clearTimeout(lookupTimer);
    const seq = ++lookupSeq;

    // Live when a key is present: a real lookup replaces the design's timed
    // pause, and the step advances when the worker actually answers.
    if (typeof NOVA !== 'undefined' && NOVA.signedIn()) {
      NOVA.call(`/api/v1/brands/${NOVA.brandId}/verify-handle`, {
        method: 'POST',
        body: JSON.stringify({
          platform: state.platform.toLowerCase(),
          handle: state.handle,
          companyName: state.handle,
        }),
      })
        .then((d) => {
          if (seq !== lookupSeq) return;     // a newer lookup already answered
          state.account = d.found ? d.account : null;
          state.warn = Boolean(d.account?.warning);
          state.mode = d.found ? 'found' : 'notfound';
          go(3);
        })
        .catch((err) => {
          if (seq !== lookupSeq) return;
          state.account = null;
          state.warn = false;
          state.mode = 'failed';
          state.error = err.message;
          NOVA.notice(`Lookup failed — ${err.message}`);
          go(3);
        });
      return;
    }
    state.account = null;
    state.warn = false;
    state.mode = 'sample';
    lookupTimer = setTimeout(() => go(3), 1600);
  },
};

function go(n) { state.step = n; paint(); }

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(); }
});

document.addEventListener('input', (e) => {
  if (!e.target.matches('[data-action="onHandle"], input[type="text"], input:not([type])')) return;
  state.handle = e.target.value.replace(/^@/, '');
  paint();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); actions.onLookup(); }
});

paint();

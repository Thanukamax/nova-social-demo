/**
 * Connect flow — the four-step state machine from the design file.
 *
 * Ported from the prototype's own Component logic, not reinterpreted: the same
 * steps, the same 1600ms lookup pause, the same platform tinting. The markup
 * and every inline style come from the design unchanged.
 */
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];

const PLATFORM_TINT = {
  Instagram: { bg: 'rgba(221,42,123,.07)', bd: 'rgba(221,42,123,.45)' },
  TikTok:    { bg: 'rgba(15,15,20,.05)',   bd: 'rgba(15,15,20,.55)' },
  YouTube:   { bg: 'rgba(255,0,0,.06)',    bd: 'rgba(255,0,0,.42)' },
};

const state = { step: 1, handle: 'kandos.lk', platform: 'Instagram', warn: false };
let lookupTimer = null;

function paint() {
  qa('[data-when]').forEach((el) => {
    const want = el.dataset.when;
    const on = want === `isStep${state.step}` || (want === 'showWarn' && state.warn);
    el.hidden = !on;
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

  const at = '@' + (state.handle || 'yourbrand');
  qa('[data-bind="handleAt"]').forEach((el) => { el.textContent = at; });
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

    // Live when a key is present: a real lookup replaces the design's timed
    // pause, and the step advances when the worker actually answers.
    if (typeof NOVA !== 'undefined' && NOVA.live()) {
      NOVA.call(`/api/v1/brands/${NOVA.brandId}/verify-handle`, {
        method: 'POST',
        body: JSON.stringify({
          platform: state.platform.toLowerCase(),
          handle: state.handle,
          companyName: state.handle,
        }),
      })
        .then((d) => {
          state.warn = Boolean(d.account?.warning);
          state.found = d.found;
          go(3);
        })
        .catch(() => go(3));
      return;
    }
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

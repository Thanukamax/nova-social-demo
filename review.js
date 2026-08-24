/**
 * Review queue.
 *
 * One decision at a time, because that is what the reviewer is actually doing:
 * answering "are these the same company" twelve times. A table of twelve rows
 * would make them re-orient on every line; a focused card plus keyboard keys
 * turns it into a rhythm.
 *
 * Decisions are held locally and exported at the end. Nothing is written back
 * automatically — accepting a wrong match publishes a stranger's numbers under
 * a real brand's name, so the last step stays deliberate.
 */
const $ = (id) => document.getElementById(id);
const QUEUE = window.NOVA_REVIEW || [];
const STORE = 'nova.review.decisions';

// Every field on a review row (displayName, handle, signal text) is the found
// account's own data — an attacker can name their Instagram account
// `<img src=x onerror=…>`. These land in innerHTML below, so anything
// interpolated into markup MUST be escaped or it runs as script in the
// reviewer's browser on this origin.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * `JSON.parse('null')` succeeds and returns null, so parse-with-fallback lets a
 * stored "null" through; every later `decisions[key]` read then throws, render
 * never runs, and the page cannot even draw the button that would clear it.
 * Accept only a plain object.
 */
function readDecisions() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

let decisions = readDecisions();

const pending = () => QUEUE.filter((i) => !decisions[key(i)]);
const key = (i) => `${i.platform}:${i.brand}:${i.handle}`;
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
const initials = (s) => (s || '?').replace(/[^A-Za-z ]/g, '').split(' ')
  .filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(decisions)); } catch { /* private mode */ }
}

function paintProgress() {
  const done = QUEUE.length - pending().length;
  $('count').textContent = `${done} of ${QUEUE.length} reviewed`;
  $('progress').innerHTML = QUEUE.map((item, idx) => {
    const state = decisions[key(item)] ? 'done' : idx === done ? 'now' : '';
    return `<i class="${state}"></i>`;
  }).join('');
}

function profileUrl(item) {
  // Encoded, not interpolated: a handle is the account's own text and may carry
  // `/`, `?` or a quote, any of which changes what the link points at.
  const handle = encodeURIComponent(String(item.handle ?? ''));
  return item.platform === 'tiktok'
    ? `https://www.tiktok.com/@${handle}`
    : `https://www.instagram.com/${handle}/`;
}

function render() {
  paintProgress();
  const item = pending()[0];
  if (!item) return renderDone();

  // Warnings first: the doubt is the thing being resolved, so it leads.
  const order = { warn: 0, good: 1, neutral: 2 };
  const sig = [...(Array.isArray(item.signals) ? item.signals : [])]
    .sort((a, b) => (order[a.kind] ?? 2) - (order[b.kind] ?? 2));

  // `s.kind` is compared against a fixed set for ordering, but it is still
  // account-derived data going into a class attribute — escape it too.
  $('stage').innerHTML = `
    <div class="card">
      <div class="compare">
        <div class="side">
          <h2>Brand on Nova</h2>
          <p class="brandname">${esc(item.brand)}</p>
          <span class="from">from the brand directory · no account confirmed yet</span>
        </div>
        <div class="vs"></div>
        <div class="side found">
          <h2>Account we found · ${esc(item.platform)}</h2>
          <div class="acct">
            <div class="av">${esc(initials(item.displayName || item.handle))}</div>
            <div>
              <b>${esc(item.displayName || '—')}${item.verified ? '<span class="tick">verified</span>' : ''}</b>
              <span>@${esc(item.handle)}</span>
            </div>
          </div>
          <div class="figs">
            <div class="fig"><span class="n">${esc(fmt(item.followers))}</span><span class="k">Followers</span></div>
            <div class="fig"><span class="n">${esc(item.score)}</span><span class="k">Match score</span></div>
          </div>
          <ul class="sig">
            ${sig.map((s) => `<li class="${esc(s.kind)}"><span class="m"></span><span>${esc(s.text)}</span></li>`).join('')}
          </ul>
        </div>
      </div>
      <div class="acts">
        <button class="yes" id="yes">Yes, same company<kbd>Y</kbd></button>
        <button class="no" id="no">No, wrong account<kbd>N</kbd></button>
        <button class="skip" id="skip">Decide later<kbd>S</kbd></button>
        <a class="open" href="${esc(profileUrl(item))}" target="_blank" rel="noopener noreferrer">Open the profile ↗</a>
      </div>
    </div>`;

  $('yes').onclick = () => decide(item, 'accepted');
  $('no').onclick = () => decide(item, 'rejected');
  $('skip').onclick = () => skip(item);

  // With one item left there is nothing to move it behind: the old code spliced
  // it out, pushed it back to the same index and redrew the identical card, so
  // the button looked broken. Say why it cannot be used instead.
  if (pending().length === 1) {
    $('skip').disabled = true;
    $('skip').style.opacity = '.45';
    $('skip').style.cursor = 'not-allowed';
    $('skip').title = 'This is the last one left — decide it, or come back later.';
  }
}

let skipped = [];

function decide(item, verdict) {
  decisions[key(item)] = { verdict, brand: item.brand, platform: item.platform,
                           handle: item.handle, at: new Date().toISOString() };
  save();
  render();
}

function skip(item) {
  if (pending().length < 2) return;
  // Move to the back rather than marking it done — "later" is not a decision,
  // and silently dropping it would leave the brand unresolved with no trace.
  const i = QUEUE.indexOf(item);
  if (i > -1) { QUEUE.splice(i, 1); QUEUE.push(item); skipped.push(key(item)); }
  render();
}

function renderDone() {
  const all = Object.values(decisions);
  const accepted = all.filter((d) => d.verdict === 'accepted');
  const rejected = all.filter((d) => d.verdict === 'rejected');

  $('stage').innerHTML = `
    <div class="card">
      <div class="done">
        <h2>Queue clear</h2>
        <p>Every account has a decision. Accepted matches are ready to be written back as public-tier connections; rejected ones leave the brand unresolved, which is the correct outcome when we genuinely do not know.</p>
        <div class="acts" style="justify-content:center">
          <button class="yes" id="copy">Copy decisions</button>
          <button class="no" id="reset">Start over</button>
        </div>
      </div>
      <div class="tally">
        <div class="accepted"><span class="n">${accepted.length}</span><span class="k">Accepted</span></div>
        <div class="rejected"><span class="n">${rejected.length}</span><span class="k">Rejected</span></div>
        <div><span class="n">${QUEUE.length}</span><span class="k">Reviewed</span></div>
      </div>
      <pre id="out">${esc(JSON.stringify(all, null, 2))}</pre>
    </div>`;

  $('copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(all, null, 2));
      $('copy').textContent = 'Copied';
    } catch {
      // Clipboard is blocked in some contexts; the JSON is on screen regardless.
      $('copy').textContent = 'Select the JSON below';
    }
  };
  $('reset').onclick = () => { decisions = {}; save(); render(); };
  paintProgress();
}

document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.metaKey || e.ctrlKey) return;
  const k = e.key.toLowerCase();
  if (k === 'y') $('yes')?.click();
  else if (k === 'n') $('no')?.click();
  else if (k === 's') $('skip')?.click();
});

render();

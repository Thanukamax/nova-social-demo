/**
 * Brand dashboard.
 *
 * Reads live metrics and talks to NuNu when a key is configured; otherwise it
 * renders the real figures captured from the live worker (sample-data.js), so
 * the layout is exercised against genuine numbers rather than invented ones.
 */
const $ = (id) => document.getElementById(id);
const CFG_KEY = 'nova.demo.cfg';

let cfg = {};
try { cfg = JSON.parse(sessionStorage.getItem(CFG_KEY) || '{}'); } catch { cfg = {}; }
const live = Boolean(cfg.key && cfg.url);
const brandId = cfg.brandId || 'brand_kandos_demo';

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');
const initials = (s) => (s || '?').replace(/[^A-Za-z ]/g, '').split(' ')
  .filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function renderHeader(brand, handle) {
  $('brandName').textContent = brand;
  $('brandHandle').textContent = `@${handle}`;
  $('av').textContent = initials(brand);
}

/**
 * Tiles carry the summary. Each platform gets its own tile with its name
 * written on it — identity is the label, not a colour, so no second hue has to
 * be invented alongside Nova's single accent.
 */
function renderTiles(accounts) {
  const total = accounts.reduce((a, x) => a + (x.followers || 0), 0);
  const tiles = [
    `<div class="tile"><span class="lbl">Total following</span>
       <span class="val">${fmt(total)}</span>
       <div class="cap">across ${accounts.length} connected account${accounts.length === 1 ? '' : 's'}</div></div>`,
    ...accounts.map((a) => `
      <div class="tile"><span class="lbl">${a.platform}</span>
        <span class="val">${fmt(a.followers)}</span>
        <div class="cap">${fmt(a.mediaCount)} posts &nbsp;<span class="chip ok">public tier</span></div></div>`),
    `<div class="tile"><span class="lbl">Next snapshot</span>
       <span class="val">6h</span>
       <div class="cap">history builds from today &nbsp;<span class="chip pending">day 1</span></div></div>`,
  ];
  $('tiles').innerHTML = tiles.join('');
}

/**
 * Magnitude in-row rather than a separate chart: the table already carries the
 * ranking, and a bar anchored to the cell shows the gaps between rows that a
 * column of digits hides.
 */
function renderPosts(posts) {
  const ranked = [...posts].sort((a, b) => (b.views ?? b.likes ?? 0) - (a.views ?? a.likes ?? 0)).slice(0, 8);
  const peak = Math.max(...ranked.map((p) => p.views ?? p.likes ?? 0), 1);

  $('rows').innerHTML = ranked.map((p) => {
    const v = p.views ?? 0;
    const pct = Math.max(2, Math.round((v / peak) * 100));
    const caption = (p.caption || '—').replace(/</g, '&lt;');
    const link = p.permalink
      ? `<a href="${p.permalink}" target="_blank" rel="noopener noreferrer">${caption}</a>`
      : caption;
    return `<tr>
      <td class="plat">${p.platform}</td>
      <td class="cap" title="${caption.replace(/"/g, '&quot;')}">${link}</td>
      <td><div class="bar" title="${fmt(v)} views"><i style="width:${pct}%"></i><em>${fmt(v)}</em></div></td>
      <td class="num">${fmt(p.likes)}</td>
      <td class="num">${fmt(p.comments)}</td>
    </tr>`;
  }).join('');
}

function bubble(role, text) {
  const el = document.createElement('div');
  el.className = `msg ${role}`;
  el.textContent = text;
  $('log').appendChild(el);
  $('log').scrollTop = $('log').scrollHeight;
  return el;
}

const history = [];

async function ask(question) {
  if (!question.trim()) return;
  bubble('me', question);
  history.push({ role: 'user', content: question });
  $('q').value = '';
  const pending = bubble('it', 'Thinking…');

  if (!live) {
    // Being explicit beats faking an answer: a canned reply here would
    // misrepresent what the assistant actually does.
    pending.textContent =
      'NuNu runs on the live API. Open the start page, click "sample data" in the header, and paste an internal key — then come back and ask again.';
    return;
  }

  try {
    const res = await fetch(`${cfg.url}/api/v1/brands/${brandId}/chat`, {
      method: 'POST',
      headers: { 'x-nova-key': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyName: window.NOVA_SAMPLE.brand, messages: history }),
    });

    if (res.status === 401) {
      pending.textContent = 'The API rejected the saved key. Open the start page, click the header menu, and re-paste it — 64 hex characters, no prefix.';
      return;
    }
    if (res.status === 429) {
      pending.textContent = 'That is more questions than the rate limit allows. Try again in a minute.';
      return;
    }
    const d = await res.json();
    pending.textContent = d.content;
    history.push({ role: 'assistant', content: d.content });

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = [
      d.refused ? 'refused' : 'answered',
      ...(d.toolsUsed || []),
    ].join(' · ');
    pending.appendChild(meta);
  } catch (err) {
    pending.textContent = `Could not reach the assistant: ${err.message}`;
  }
}

async function load() {
  const sample = window.NOVA_SAMPLE;
  renderHeader(sample.brand, sample.handle);

  if (!live) {
    renderTiles(sample.accounts);
    renderPosts(sample.posts);
    bubble('it', `Hello — I'm NuNu. I can answer questions about ${sample.brand}'s own accounts.`);
    return;
  }

  $('mode').textContent = 'Live API';
  try {
    const res = await fetch(`${cfg.url}/api/v1/brands/${brandId}/metrics?days=30&postLimit=40`, {
      headers: { 'x-nova-key': cfg.key },
    });
    const d = await res.json();

    // Snapshots are append-only, so the same account and post appear once per
    // capture. Collapse to the newest before rendering or every row doubles.
    const byPlatform = new Map();
    for (const a of d.accounts) if (!byPlatform.has(a.platform)) byPlatform.set(a.platform, a);
    const seen = new Set();
    const posts = d.posts.filter((p) => !seen.has(p.postId) && seen.add(p.postId));

    renderTiles([...byPlatform.values()]);
    renderPosts(posts.length ? posts : sample.posts);
    $('sub').textContent = `Public metrics for ${brandId}, refreshed every six hours.`;
  } catch (err) {
    renderTiles(sample.accounts);
    renderPosts(sample.posts);
    $('mode').textContent = `Live API unreachable (${err.message}) — showing captured data.`;
  }
  bubble('it', `Hello — I'm NuNu. I can answer questions about ${sample.brand}'s own accounts.`);
}

document.querySelectorAll('.suggest button').forEach((b) =>
  b.addEventListener('click', () => ask(b.dataset.q)));
$('send').addEventListener('click', () => ask($('q').value));
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('q').value); });

load();

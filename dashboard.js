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
let LAST_POSTS = [];

function renderPosts(posts) {
  LAST_POSTS = posts;
  const ranked = [...posts].sort((a, b) => (b.views ?? b.likes ?? 0) - (a.views ?? a.likes ?? 0)).slice(0, 8);
  const peak = Math.max(...ranked.map((p) => p.views ?? p.likes ?? 0), 1);

  $('rows').innerHTML = ranked.map((p) => {
    const v = p.views ?? 0;
    const pct = Math.max(2, Math.round((v / peak) * 100));
    const caption = (p.caption || '—').replace(/</g, '&lt;');
    const link = p.permalink
      ? `<a href="${p.permalink}" target="_blank" rel="noopener noreferrer">${caption}</a>`
      : caption;
    return `<tr data-post="${encodeURIComponent(JSON.stringify(p))}">
      <td class="plat">${p.platform}</td>
      <td class="cap" title="${caption.replace(/"/g, '&quot;')}">${caption}</td>
      <td><div class="bar" title="${fmt(v)} views"><i style="width:${pct}%"></i><em>${fmt(v)}</em></div></td>
      <td class="num">${fmt(p.likes)}</td>
      <td class="num">${fmt(p.comments)}</td>
    </tr>`;
  }).join('');

  // The row opens the detail rather than the platform: the numbers, what people
  // said and what to do about it belong together, and the outbound link is the
  // last step rather than the first.
  document.querySelectorAll('#rows tr').forEach((tr) => {
    tr.addEventListener('click', () => {
      try { openPost(JSON.parse(decodeURIComponent(tr.dataset.post))); } catch { /* malformed row */ }
    });
  });
}

/* ---------------------------------------------------------------- *
 * Post detail
 * ---------------------------------------------------------------- */

/**
 * A raw count means little on its own. "4,120 likes" is only useful next to
 * what this account usually gets, so every figure is shown against the brand's
 * own average rather than in isolation.
 */
function against(value, average) {
  if (!value || !average) return null;
  const ratio = value / average;
  if (ratio >= 1.15) return `${ratio.toFixed(1)}× your average`;
  if (ratio <= 0.85) return `${ratio.toFixed(1)}× your average`;
  return 'about your average';
}

function averages(posts, platform) {
  const peers = posts.filter((p) => p.platform === platform);
  const mean = (k) => {
    const vals = peers.map((p) => p[k]).filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };
  return { likes: mean('likes'), comments: mean('comments'), views: mean('views') };
}

function openPost(p) {
  const avg = averages(LAST_POSTS, p.platform);
  const followers = (window.NOVA_SAMPLE.accounts.find((a) => a.platform === p.platform) || {}).followers || 0;
  const engagement = followers ? (((p.likes || 0) + (p.comments || 0)) / followers) * 100 : null;
  const when = p.publishedAt ? new Date(p.publishedAt).toLocaleString('en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const cell = (k, n, vs) => `<div><span class="k">${k}</span><span class="n">${n}</span>${vs ? `<span class="vs">${vs}</span>` : ''}</div>`;

  $('postBody').innerHTML = `
    <div class="pd">
      <span class="kind">${p.mediaType || 'post'} · ${p.platform}</span>
      <h2>${(p.caption || 'Untitled post').slice(0, 110)}</h2>
      <p class="when">${when}</p>

      <div class="mgrid">
        ${cell('Views', fmt(p.views), against(p.views, avg.views))}
        ${cell('Likes', fmt(p.likes), against(p.likes, avg.likes))}
        ${cell('Comments', fmt(p.comments), against(p.comments, avg.comments))}
        ${cell('Engagement', engagement ? engagement.toFixed(2) + '%' : '—', followers ? `of ${fmt(followers)} followers` : '')}
        <div class="locked"><span class="k">Reach, saves</span><span class="n">Not public</span>
          <span class="vs">connect to record these</span></div>
      </div>

      <h3>What people said</h3>
      <p class="said" id="saidLede">Reading the comments…</p>
      <div id="themes"></div>

      <h3 style="margin-top:26px">NuNu · what to do next</h3>
      <div id="sugs"><p class="quiet">Working out what these comments mean…</p></div>

      <div class="acts">
        ${p.permalink ? `<a class="go" href="${p.permalink}" target="_blank" rel="noopener noreferrer">View the post ↗</a>` : ''}
        <button class="ghost" id="askAbout">Ask NuNu about this post</button>
      </div>
    </div>`;

  $('post').showModal();
  $('askAbout').onclick = () => {
    $('post').close();
    ask(`About the post "${(p.caption || '').slice(0, 60)}" — what should I take from it?`);
    document.querySelector('.chat')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  loadInsight(p);
}

async function loadInsight(p) {
  if (!live) {
    $('saidLede').textContent =
      'Comment analysis runs on the live API. Add a key on the start page and reopen this post.';
    $('sugs').innerHTML = '';
    return;
  }
  if (!p.permalink) {
    $('saidLede').textContent = 'This post has no public link, so its comments cannot be read.';
    $('sugs').innerHTML = '';
    return;
  }

  try {
    const res = await fetch(`${cfg.url}/api/v1/brands/${brandId}/posts/insight`, {
      method: 'POST',
      headers: { 'x-nova-key': cfg.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        permalink: p.permalink, caption: p.caption,
        metrics: { views: p.views, likes: p.likes, comments: p.comments },
        totalComments: p.comments ?? null,
      }),
    });
    if (res.status === 429) {
      $('saidLede').textContent = 'Rate limited — try this post again in a minute.';
      $('sugs').innerHTML = ''; return;
    }
    const d = await res.json();

    if (!d.commentsRead) {
      // Saying so beats an empty panel that looks like a loading failure.
      $('saidLede').textContent = 'No comments were readable on this post.';
      $('themes').innerHTML = ''; $('sugs').innerHTML = '';
      return;
    }

    $('saidLede').textContent =
      `${fmt(p.comments ?? d.commentsRead)} comments, grouped by what they were about.` +
      (d.sentiment ? ` Overall ${d.sentiment}.` : '');

    $('themes').innerHTML = d.themes.map((t) => `
      <div class="theme">
        <span class="c">${t.count || '—'}</span>
        <div><b>${t.label}</b>${t.quote ? `<q>“${t.quote}”</q>` : ''}</div>
      </div>`).join('') || '<p class="quiet">No clear grouping in these comments.</p>';

    $('sugs').innerHTML = d.suggestions.length
      ? d.suggestions.map((s, i) => `
        <div class="sug">
          <span class="i">${i + 1}</span>
          <div><b>${s.title}</b><span class="h">${s.horizon}</span><p>${s.detail}</p></div>
        </div>`).join('')
      : '<p class="quiet">Nothing here warrants a change yet.</p>';
  } catch (err) {
    $('saidLede').textContent = `Could not read the comments — ${err.message}`;
    $('sugs').innerHTML = '';
  }
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

$('postClose').addEventListener('click', () => $('post').close());

document.querySelectorAll('.suggest button').forEach((b) =>
  b.addEventListener('click', () => ask(b.dataset.q)));
$('send').addEventListener('click', () => ask($('q').value));
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('q').value); });

load();

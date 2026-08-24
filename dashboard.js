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

const PLATFORM_LABEL = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube' };
let VIEW = { platform: null, accounts: [], posts: [], snapshotSeries: [], readAt: null };

function renderTabs() {
  const platforms = VIEW.accounts.map((a) => a.platform);
  $('tabs').innerHTML = platforms.map((p) => `
    <button class="tab" role="tab" data-p="${p}" aria-selected="${p === VIEW.platform}">
      ${PLATFORM_LABEL[p] || p}
    </button>`).join('');
  document.querySelectorAll('.tab').forEach((b) =>
    b.addEventListener('click', () => { VIEW.platform = b.dataset.p; paint(); }));
}

/**
 * A follower delta is only honest if two snapshots are far enough apart to
 * mean something. The design says "+124 since yesterday"; with snapshots taken
 * minutes apart the truthful line is how long ago the previous one was, so the
 * label is derived from the real gap rather than asserting a day passed.
 */
function followerDelta(series) {
  if (series.length < 2) return 'first snapshot — changes appear from the next one';
  const [newest, previous] = series;
  if (newest.followers == null || previous.followers == null) return '';

  const diff = newest.followers - previous.followers;
  const hours = Math.round(
    (new Date(newest.capturedAt) - new Date(previous.capturedAt)) / 3_600_000);
  const when = hours >= 20 ? 'since yesterday' : hours >= 1 ? `in the last ${hours}h` : 'since the last snapshot';

  if (diff === 0) return `no change ${when}`;
  return `${diff > 0 ? '+' : ''}${fmt(diff)} ${when}`;
}

/**
 * Four tiles, each a figure plus the context that makes it mean something. A
 * follower count with nothing beside it is a number; with a delta and a
 * denominator it is an answer.
 */
function renderTiles(account, posts, series) {
  const followers = account?.followers ?? null;
  const videos = posts.filter((p) => (p.mediaType || '').includes('video') || p.mediaType === 'video');
  const stills = posts.length - videos.length;

  const likeVals = posts.map((p) => p.likes).filter((v) => typeof v === 'number');
  const avgLikes = likeVals.length ? Math.round(likeVals.reduce((a, b) => a + b, 0) / likeVals.length) : null;

  const engaged = posts.reduce((a, p) => a + (p.likes || 0) + (p.comments || 0), 0);
  const rate = followers && posts.length
    ? ((engaged / posts.length / followers) * 100).toFixed(1) + '%'
    : '—';

  const tile = (label, value, note) =>
    `<div class="tile"><span class="lbl">${label}</span><span class="val">${value}</span>
       <div class="cap">${note}</div></div>`;

  $('tiles').innerHTML = [
    tile('Followers', fmt(followers), followerDelta(series)),
    tile('Posts on record', fmt(posts.length),
         posts.length ? `${videos.length} video, ${stills} still` : 'none captured yet'),
    tile('Avg likes', fmt(avgLikes), posts.length ? `per post, last ${posts.length}` : '—'),
    tile('Engagement', rate, 'likes + comments / followers'),
  ].join('');
}

/**
 * Magnitude in-row rather than a separate chart: the table already carries the
 * ranking, and a bar anchored to the cell shows the gaps between rows that a
 * column of digits hides.
 */
let LAST_POSTS = [];

function renderPosts(posts) {
  LAST_POSTS = posts;
  // Ranked and scaled by likes: the design's column is "Likes vs best", and
  // likes are the one figure every platform reports the same way.
  const ranked = [...posts].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, 8);
  const peak = Math.max(...ranked.map((p) => p.likes ?? 0), 1);

  $('rows').innerHTML = ranked.map((p) => {
    const likes = p.likes ?? 0;
    const pct = Math.max(2, Math.round((likes / peak) * 100));
    const caption = (p.caption || 'Untitled post').replace(/</g, '&lt;');
    const followers = (VIEW.accounts.find((a) => a.platform === p.platform) || {}).followers || 0;
    const rate = followers ? (((likes + (p.comments || 0)) / followers) * 100).toFixed(2) + '%' : '—';
    const when = p.publishedAt
      ? new Date(p.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : '';
    const meta = [p.mediaType, when, p.views ? `${fmt(p.views)} views` : null].filter(Boolean).join(' · ');

    return `<tr data-post="${encodeURIComponent(JSON.stringify(p))}">
      <td><span class="ptitle">${caption.slice(0, 74)}</span><div class="pmeta">${meta}</div></td>
      <td><div class="bar" title="${fmt(likes)} likes"><i style="width:${pct}%"></i><em>${fmt(likes)}</em></div></td>
      <td class="num">${fmt(p.comments)}</td>
      <td class="num">${rate}</td>
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

function paint() {
  const account = VIEW.accounts.find((a) => a.platform === VIEW.platform);
  const posts = VIEW.posts.filter((p) => p.platform === VIEW.platform);
  const series = VIEW.snapshotSeries.filter((a) => a.platform === VIEW.platform);

  renderTabs();
  $('h1').textContent = `${window.NOVA_SAMPLE.brand} on ${PLATFORM_LABEL[VIEW.platform] || VIEW.platform}`;

  const read = VIEW.readAt
    ? new Date(VIEW.readAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : null;
  const n = series.length;
  $('freshness').textContent =
    `Public figures${read ? `, read today at ${read}` : ''}. ${n} snapshot${n === 1 ? '' : 's'} on record.`;

  renderTiles(account, posts, series);
  renderPosts(posts);

  // The trend headline states the record rather than drawing one. Two captures
  // minutes apart is not a line, and a chart drawn from them would invent a
  // shape the data does not have.
  $('snapshotLine').textContent = n >= 8
    ? 'Enough record to chart.'
    : `${n} snapshot${n === 1 ? '' : 's'} so far — not yet a line.`;
  $('trendWhy').textContent =
    `${PLATFORM_LABEL[VIEW.platform] || 'The platform'} keeps no long history of its own, so a line drawn now would invent a shape. The chart appears once there is enough record to be true.`;

  $('postsScope').textContent = posts.length
    ? `Last 30 days, public figures · ${posts.length} on record`
    : 'Nothing captured yet';
  $('lockedWhy').textContent =
    `Reach, impressions and saves are never rendered publicly by ${PLATFORM_LABEL[VIEW.platform] || 'the platform'}, so no one can read them from outside — including us. Connect the account and Nova records them alongside the rest.`;
}

async function load() {
  const sample = window.NOVA_SAMPLE;
  renderHeader(sample.brand, sample.handle);

  const seed = (accounts, posts, series, readAt) => {
    VIEW.accounts = accounts;
    VIEW.posts = posts;
    VIEW.snapshotSeries = series;
    VIEW.readAt = readAt;
    VIEW.platform = accounts[0]?.platform ?? 'instagram';
    paint();
  };

  if (!live) {
    seed(sample.accounts, sample.posts,
         sample.accounts.map((a) => ({ ...a, capturedAt: new Date().toISOString() })),
         new Date().toISOString());
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

    seed([...byPlatform.values()], posts.length ? posts : sample.posts,
         d.accounts, d.accounts[0]?.capturedAt ?? null);
  } catch (err) {
    seed(sample.accounts, sample.posts,
         sample.accounts.map((a) => ({ ...a, capturedAt: new Date().toISOString() })),
         new Date().toISOString());
    $('mode').textContent = `Live API unreachable (${err.message}) — showing captured data.`;
  }
  bubble('it', `Hello — I'm NuNu. I can answer questions about ${sample.brand}'s own accounts.`);
}

$('postClose').addEventListener('click', () => $('post').close());
$('connectMore').addEventListener('click', () => { window.location.href = './'; });

document.querySelectorAll('.suggest button').forEach((b) =>
  b.addEventListener('click', () => ask(b.dataset.q)));
$('send').addEventListener('click', () => ask($('q').value));
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') ask($('q').value); });

load();

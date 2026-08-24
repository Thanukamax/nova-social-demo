/**
 * Dashboard wiring.
 *
 * The markup is the design's. This fills its figures with the real captured
 * account, opens the post detail from any row, and puts NuNu on the live
 * worker — reusing the design's own bubble markup for new messages so a live
 * answer is indistinguishable from the mocked one.
 */
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const D = window.DARAZ;
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : '—');

/* ---- identity and figures ---------------------------------------- */

const FILL = {
  handleAt: `@${D.handle}`,
  heading: `${D.brand} on Instagram`,
  followers: fmt(D.followers),
  avgLikes: fmt(D.avgLikes),
};
qa('[data-fill]').forEach((el) => {
  const v = FILL[el.dataset.fill];
  if (v) el.textContent = v;
});
qa('*').forEach((el) => {
  // The design seeds NuNu's transcript with @kandos.lk; the host account here
  // is Daraz, and a stale handle in the assistant's own words reads as a bug.
  if (el.children.length === 0 && el.textContent.includes('@kandos.lk')) {
    el.textContent = el.textContent.replace(/@kandos\.lk/g, `@${D.handle}`);
  }
});

/* ---- post rows --------------------------------------------------- */

/**
 * The design lays out five rows with its own figures. Rather than rebuild the
 * row markup, each rendered row is matched to a real post in order and its
 * text nodes swapped — the styling stays exactly as designed.
 */
function fillPosts() {
  const rows = qa('a[href="#1e"]').map((a) => a.closest('div[style*="grid"]') || a.parentElement?.parentElement);
  D.posts.forEach((post, i) => {
    const row = rows[i];
    if (!row) return;
    const link = qa('a[href="#1e"]', row)[0];
    if (link) link.textContent = post.title;
    row.dataset.post = encodeURIComponent(JSON.stringify(post));
    const bar = qa('div[style*="width:"]', row).find((d) => /width:\s*\d+%/.test(d.getAttribute('style') || ''));
    if (bar) bar.style.width = post.w;
    const nums = qa('span', row).filter((s) => /^[\d,]+$|^\d+(\.\d+)?%$/.test(s.textContent.trim()));
    if (nums[0]) nums[0].textContent = post.likes;
    if (nums[1]) nums[1].textContent = post.comments;
    if (nums[2]) nums[2].textContent = post.rate;
  });
}
fillPosts();

/* ---- post detail ------------------------------------------------- */

const dialog = q('#postDialog');
qa('a[href="#1e"]').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  const row = a.closest('[data-post]');
  if (row) fillDetail(JSON.parse(decodeURIComponent(row.dataset.post)));
  dialog?.showModal();
}));

function fillDetail(post) {
  if (!dialog) return;
  const t = qa('h1,h2,h3', dialog)[0];
  if (t) t.textContent = post.title;
  const view = qa('a', dialog).find((a) => /view the post/i.test(a.textContent));
  if (view && post.permalink) view.href = post.permalink;
  loadInsight(post);
}

async function loadInsight(post) {
  const slot = qa('div', dialog).find((d) => /comments, grouped/i.test(d.textContent) && d.children.length === 0);
  if (!NOVA.live()) {
    if (slot) slot.textContent = 'Comment analysis runs live. Add ?key=… to the URL to switch it on.';
    return;
  }
  if (slot) slot.textContent = 'Reading the comments…';
  try {
    const d = await NOVA.call(`/api/v1/brands/${NOVA.brandId}/posts/insight`, {
      method: 'POST',
      body: JSON.stringify({ permalink: post.permalink, caption: post.title, totalComments: Number(String(post.comments).replace(/,/g,'')) || null }),
    });
    if (slot) slot.textContent = d.commentsRead
      ? `${post.comments} comments, grouped by what they were about.${d.sentiment ? ` Overall ${d.sentiment}.` : ''}`
      : 'No comments were readable on this post.';
  } catch (err) {
    if (slot) slot.textContent = `Could not read the comments — ${err.message}`;
  }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dialog?.close(); });
dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

/* ---- NuNu, live -------------------------------------------------- */

const input = q('#nunuInput');
const send = q('#nunuSend');

/**
 * The transcript and its two bubble shapes are found by anchoring on the
 * design's own seeded exchange, then cloned for every live message.
 *
 * The first attempt searched for any div containing the seeded question, which
 * matched the outermost wrapper — so replies were appended to the page instead
 * of the panel and rendered full-width across the bottom. Anchoring on the
 * text node and walking up one level finds the actual transcript, and cloning
 * the existing bubbles means a live reply is styled identically to the mocked
 * one without restating any of the design's values here.
 */
const SEED_Q = 'Did the Avurudu reel do better than our usual posts?';

const seedUser = qa('div').filter((d) => d.textContent.trim() === SEED_Q).pop() || null;
const log = seedUser?.parentElement || null;
const seedBot = seedUser?.nextElementSibling || null;

function bubble(role, text) {
  if (!log) return null;

  const template = role === 'me' ? seedUser : seedBot;
  if (!template) return null;

  const el = template.cloneNode(true);
  // The assistant bubble wraps its glyph and its text; the text is the last
  // child. The user bubble is the text node itself.
  const slot = role === 'me' ? el : el.lastElementChild;
  slot.textContent = text;

  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return { el, slot };
}

const history = [];

async function ask(question) {
  if (!question.trim()) return;
  bubble('me', question);
  history.push({ role: 'user', content: question });
  if (input) input.value = '';

  const pending = bubble('it', 'Thinking…');
  if (!pending) return;

  if (!NOVA.live()) {
    pending.slot.textContent =
      'I run on the live worker. Reload with ?key=<worker key> and ask again.';
    return;
  }

  try {
    const d = await NOVA.call(`/api/v1/brands/${NOVA.brandId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ companyName: D.brand, messages: history }),
    });
    pending.slot.textContent = d.content;
    history.push({ role: 'assistant', content: d.content });

    if (d.toolsUsed?.length || d.refused) {
      const meta = document.createElement('div');
      meta.setAttribute('style', 'margin-top:6px;font-size:11px;color:#9A9AA4');
      meta.textContent = [d.refused ? 'refused' : 'answered', ...(d.toolsUsed || [])].join(' · ');
      pending.slot.appendChild(meta);
    }
  } catch (err) {
    pending.slot.textContent = err.message;
  }
}

send?.addEventListener('click', () => ask(input.value));
input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ask(input.value); } });
qa('button').filter((b) => /Compare to March|What should we post next|Why did comments spike/.test(b.textContent))
  .forEach((b) => b.addEventListener('click', () => ask(b.textContent.trim())));

/* ---- live figures ------------------------------------------------ */

(async () => {
  if (!NOVA.live()) return;
  try {
    const d = await NOVA.call(`/api/v1/brands/${NOVA.brandId}/metrics?days=30&postLimit=40`);
    const ig = d.accounts.find((a) => a.platform === 'instagram');
    if (ig?.followers) q('[data-fill="followers"]').textContent = fmt(ig.followers);
  } catch { /* captured figures remain */ }
})();

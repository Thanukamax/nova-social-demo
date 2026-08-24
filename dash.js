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
const transcript = input?.closest('div')?.parentElement?.querySelector('div');
const log = (() => {
  // The design's transcript is the block holding the seeded exchanges.
  const seeded = qa('div').find((d) => /Did the Avurudu reel/.test(d.textContent) && d.children.length >= 2);
  return seeded || transcript;
})();

const history = [];
const MINE_STYLE = 'align-self:flex-end;max-width:82%;background:#4F46E5;color:#FFFFFF;border-radius:14px;padding:11px 15px;font-size:14px;line-height:1.55';
const ITS_STYLE = 'display:flex;gap:10px;align-items:flex-start;max-width:92%';

function bubble(role, text) {
  if (!log) return null;
  const el = document.createElement('div');
  if (role === 'me') {
    el.setAttribute('style', MINE_STYLE);
    el.textContent = text;
  } else {
    el.setAttribute('style', ITS_STYLE);
    el.innerHTML = `<span style="width:26px;height:26px;border-radius:8px;background:rgba(79,70,229,.10);display:grid;place-items:center;flex:none">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M5.4 17.2 11.6 11.4 18.8 6.4" stroke="rgba(79,70,229,.75)" stroke-width="1.9" stroke-linecap="round"></path><circle cx="5.4" cy="17.2" r="2.2" fill="#4F46E5"></circle><circle cx="18.8" cy="6.4" r="2.9" fill="#4F46E5"></circle></svg></span>
      <div style="font-size:14px;line-height:1.6;color:#0F0F14"></div>`;
    el.lastElementChild.textContent = text;
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

async function ask(question) {
  if (!question.trim()) return;
  bubble('me', question);
  history.push({ role: 'user', content: question });
  if (input) input.value = '';
  const pending = bubble('it', 'Thinking…');

  if (!NOVA.live()) {
    pending.lastElementChild.textContent =
      'I run on the live worker. Reload this page with ?key=<worker key> and ask again.';
    return;
  }
  try {
    const d = await NOVA.call(`/api/v1/brands/${NOVA.brandId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ companyName: D.brand, messages: history }),
    });
    pending.lastElementChild.textContent = d.content;
    history.push({ role: 'assistant', content: d.content });
    if (d.toolsUsed?.length || d.refused) {
      const meta = document.createElement('div');
      meta.setAttribute('style', 'margin-top:6px;font-size:11px;color:#9A9AA4');
      meta.textContent = [d.refused ? 'refused' : 'answered', ...(d.toolsUsed || [])].join(' · ');
      pending.lastElementChild.appendChild(meta);
    }
  } catch (err) {
    pending.lastElementChild.textContent = err.message;
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

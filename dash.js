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

/* ---- NuNu maximise ------------------------------------------------ */

/**
 * The design draws a maximise control but ships both of its icon states
 * hidden, so the button rendered as an empty box and did nothing.
 *
 * Expanding toggles a CLASS rather than rewriting the element's inline style.
 * The first version saved the original style and wrote it back on close, which
 * corrupted the panel the moment expand ran twice — the "original" it saved
 * the second time was the expanded one. A class has nothing to save: removing
 * it restores the design's own styles exactly.
 */
const nunuToggle = q('#nunuToggle');

// The panel is the nearest ancestor that holds both the control and the input,
// which is stable even if the design's wrapper markup changes around it.
const nunuPanel = (() => {
  let el = nunuToggle;
  while (el && el !== document.body) {
    if (el.querySelector('#nunuInput')) return el;
    el = el.parentElement;
  }
  return null;
})();

const style = document.createElement('style');
style.textContent = `
  .nunu-max{position:fixed!important;inset:3vh 4vw!important;z-index:60!important;
    max-width:none!important;width:auto!important;background:#FFFFFF!important;
    border:1px solid #E8E8EC!important;border-radius:18px!important;
    box-shadow:0 30px 90px rgba(15,15,20,.22)!important;
    display:flex!important;flex-direction:column!important}
  .nunu-backdrop{position:fixed;inset:0;background:rgba(15,15,20,.34);z-index:55}
`;
document.head.appendChild(style);

let backdrop = null;

function setNunuFull(on) {
  if (!nunuPanel) return;
  if (on === nunuPanel.classList.contains('nunu-max')) return;   // already there

  nunuPanel.classList.toggle('nunu-max', on);
  q('#iconExpand')?.toggleAttribute('hidden', on);
  q('#iconCollapse')?.toggleAttribute('hidden', !on);

  backdrop?.remove();
  backdrop = null;

  if (on) {
    backdrop = document.createElement('div');
    backdrop.className = 'nunu-backdrop';
    backdrop.addEventListener('click', () => setNunuFull(false));
    document.body.appendChild(backdrop);
  }

  // The transcript grows when the panel does; keep the latest message in view.
  if (log) log.scrollTop = log.scrollHeight;
}

nunuToggle?.addEventListener('click', (e) => {
  // Without this the click also reaches the document handler below and the
  // panel closes again in the same tick.
  e.preventDefault();
  e.stopPropagation();
  setNunuFull(!nunuPanel?.classList.contains('nunu-max'));
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && nunuPanel?.classList.contains('nunu-max')) setNunuFull(false);
});

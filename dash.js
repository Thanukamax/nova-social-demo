/**
 * Dashboard wiring.
 *
 * The markup is the design's. Everything with a figure in it now has a name,
 * and this file fills every one of them from the captured account. The earlier
 * version matched elements by their design copy — "the div whose text says
 * comments, grouped" — which silently stopped matching when the copy sat in a
 * <p>, and left the design's invented numbers on screen as if they were real.
 * Named hooks cannot half-match: either the element is there or the code fails
 * loudly in one place.
 */
const q = (s, r = document) => r.querySelector(s);
const qa = (s, r = document) => [...r.querySelectorAll(s)];
const D = window.DARAZ || { brand: 'Unknown', handle: 'unknown', posts: [] };
const POSTS = Array.isArray(D.posts) ? D.posts : [];
const fmt = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '—');
const num = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};
/** Only a real web link may become an href — a permalink is third-party text. */
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : null);

/* ---- identity and figures ---------------------------------------- */

const avgComments = POSTS.length
  ? POSTS.reduce((a, p) => a + (num(p.comments) || 0), 0) / POSTS.length
  : 0;
const totalLikes = POSTS.reduce((a, p) => a + (num(p.likes) || 0), 0);
const totalComments = POSTS.reduce((a, p) => a + (num(p.comments) || 0), 0);
const engagement = D.followers && POSTS.length
  ? `${(((totalLikes + totalComments) / POSTS.length / D.followers) * 100).toFixed(1)}%`
  : '—';
const snaps = typeof D.snapshots === 'number' ? D.snapshots : null;

const FILL = {
  handleAt: `@${D.handle}`,
  heading: `${D.brand} on Instagram`,
  followers: fmt(D.followers),
  avgLikes: fmt(D.avgLikes),
  postCount: String(POSTS.length),
  engagement,
  // The design's sub-lines quoted a daily delta, a reel/still split and a
  // 30-day post count that the capture does not carry. An invented figure in
  // small grey type is still an invented figure.
  followersNote: 'captured figure, no history yet',
  postCountNote: 'captured in the last sweep',
  avgLikesNote: `per post, last ${POSTS.length}`,
  snapshotLine: snaps
    ? `Public figures from the last sweep. ${snaps} snapshot${snaps === 1 ? '' : 's'} on record.`
    : 'Public figures from the last sweep.',
  trendLine: snaps
    ? `${snaps} snapshot${snaps === 1 ? '' : 's'} so far — history builds from today.`
    : 'No snapshots yet — history builds from today.',
};
qa('[data-fill]').forEach((el) => {
  const v = FILL[el.dataset.fill];
  if (v !== undefined) el.textContent = v;
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
 * One row per real post, cloned from the design's own row.
 *
 * The old version wrote over five fixed rows in order and left the rest alone,
 * so a brand with two posts saw three of the design's invented ones underneath
 * its own, and a brand with eight lost three. Cloning makes the row count a
 * consequence of the data instead of a coincidence.
 */
const rowHost = q('#postRows');

function fillRow(row, post) {
  const [head, bar, comments, rate] = [...row.children];
  const link = q('a', head);
  if (link) {
    link.textContent = post.title;
    link.href = '#post';
  }
  const meta = qa('div', head)[0];
  if (meta) meta.textContent = post.meta || '';
  const fillEl = qa('div', bar)[0];
  if (fillEl) fillEl.style.width = post.w || '0%';
  const likes = q('span', bar);
  if (likes) likes.textContent = post.likes ?? '—';
  if (comments) comments.textContent = post.comments ?? '—';
  if (rate) rate.textContent = post.rate ?? '—';
  row.dataset.post = encodeURIComponent(JSON.stringify(post));
}

function fillPosts() {
  if (!rowHost) return;
  const template = q('[data-postrow]', rowHost);
  if (!template) return;
  const blank = template.cloneNode(true);
  rowHost.textContent = '';

  if (!POSTS.length) {
    const empty = document.createElement('p');
    empty.style.cssText = 'margin:20px 0 0;font-size:14px;color:#5C5C68';
    empty.textContent = 'No posts captured for this account yet.';
    rowHost.appendChild(empty);
    q('.phead')?.setAttribute('hidden', '');
    return;
  }

  POSTS.forEach((post) => {
    const row = blank.cloneNode(true);
    fillRow(row, post);
    rowHost.appendChild(row);
  });
}
fillPosts();

/* ---- post detail ------------------------------------------------- */

const dialog = q('#postDialog');

// Scoped to the rows. The dialog's own "View the post" link carried the same
// href as a row, so the row handler swallowed its click and the only exit from
// the dialog to the real post did nothing.
rowHost?.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (!link || !rowHost.contains(link)) return;
  e.preventDefault();
  const row = link.closest('[data-post]');
  if (!row) return;
  fillDetail(JSON.parse(decodeURIComponent(row.dataset.post)));
  dialog?.showModal();
});

let openPost = null;

function setDlg(name, text) {
  const el = q(`[data-dlg="${name}"]`, dialog);
  if (el) el.textContent = text;
}

function fillDetail(post) {
  if (!dialog) return;
  openPost = post;

  q('#dlgTitle').textContent = post.title;
  const kind = String(post.meta || '').split('·').pop().trim();
  q('#dlgKind').textContent = kind ? kind[0].toUpperCase() + kind.slice(1) : 'Post';
  q('#dlgMeta').textContent = post.meta || '';

  const likes = num(post.likes);
  const comments = num(post.comments);
  setDlg('likes', post.likes ?? '—');
  setDlg('comments', post.comments ?? '—');
  setDlg('engagement', post.rate ?? '—');
  setDlg('likesNote', likes !== null && D.avgLikes
    ? `${(likes / D.avgLikes).toFixed(1)}× your average of ${fmt(D.avgLikes)}`
    : 'no average to compare against yet');
  setDlg('commentsNote', comments !== null && avgComments > 0
    ? `${(comments / avgComments).toFixed(1)}× your average`
    : 'no average to compare against yet');
  setDlg('engagementNote', D.followers ? `of ${fmt(D.followers)} followers` : 'followers unknown');

  const view = q('#dlgView');
  const href = safeUrl(post.permalink);
  if (view) {
    if (href) {
      view.href = href;
      view.target = '_blank';
      view.rel = 'noopener noreferrer';
      view.removeAttribute('aria-disabled');
      view.style.pointerEvents = '';
      view.style.opacity = '';
    } else {
      // A permalink comes from the vendor. Anything that is not http(s) —
      // javascript:, data: — must never reach an href.
      view.removeAttribute('href');
      view.setAttribute('aria-disabled', 'true');
      view.style.pointerEvents = 'none';
      view.style.opacity = '.45';
    }
  }

  loadInsight(post);
}

/* Comment analysis. Nothing here is ever the design's copy. */

function note(host, text) {
  host.textContent = '';
  const p = document.createElement('p');
  p.style.cssText = 'margin:0;font-size:13.5px;line-height:1.6;color:#5C5C68';
  p.textContent = text;
  host.appendChild(p);
}

function renderThemes(themes) {
  const host = q('#dlgThemes');
  if (!host) return;
  host.textContent = '';
  themes.forEach((t, i) => {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;gap:14px;align-items:flex-start;padding:0 0 14px${
      i < themes.length - 1 ? ';border-bottom:1px solid #E8E8EC' : ''}`;
    const count = document.createElement('span');
    count.style.cssText = 'font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;color:#4F46E5;width:38px;flex:none';
    count.textContent = String(t.count ?? '');
    const body = document.createElement('div');
    body.style.cssText = 'flex:1 1 0';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:14.5px;font-weight:500;color:#0F0F14';
    label.textContent = t.label || '';
    body.appendChild(label);
    if (t.quote) {
      const quote = document.createElement('div');
      quote.style.cssText = 'margin:4px 0 0;font-size:13.5px;line-height:1.55;color:#5C5C68';
      quote.textContent = `"${t.quote}"`;
      body.appendChild(quote);
    }
    row.append(count, body);
    host.appendChild(row);
  });
}

function renderSuggestions(items) {
  const host = q('#dlgSuggestions');
  if (!host) return;
  host.textContent = '';
  items.forEach((s, i) => {
    const card = document.createElement('div');
    card.style.cssText = 'display:flex;gap:14px;background:#FFFFFF;border-radius:12px;padding:16px 18px';
    const n = document.createElement('span');
    n.style.cssText = 'width:22px;height:22px;border-radius:7px;background:#EEF0FE;display:grid;place-items:center;flex:none;font-size:12px;font-weight:600;font-variant-numeric:tabular-nums;color:#4F46E5';
    n.textContent = String(i + 1);
    const body = document.createElement('div');
    body.style.cssText = 'flex:1 1 0';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:baseline;gap:8px';
    const title = document.createElement('span');
    title.style.cssText = 'font-size:14.5px;font-weight:600;color:#0F0F14';
    title.textContent = s.title || '';
    const horizon = document.createElement('span');
    horizon.style.cssText = 'font-size:12px;font-weight:500;color:#4F46E5';
    horizon.textContent = s.horizon || '';
    head.append(title, horizon);
    const detail = document.createElement('p');
    detail.style.cssText = 'margin:5px 0 0;font-size:13.5px;line-height:1.6;color:#5C5C68';
    detail.textContent = s.detail || '';
    body.append(head, detail);
    card.append(n, body);
    host.appendChild(card);
  });
}

async function loadInsight(post) {
  const head = q('#dlgThemesHead');
  const themes = q('#dlgThemes');
  const suggestions = q('#dlgSuggestions');
  if (!head || !themes || !suggestions) return;

  if (!NOVA.live()) {
    head.textContent = 'Comment analysis runs live. Add #key=… to the URL to switch it on.';
    note(themes, 'Nothing is shown here without a live read — the numbers would be invented.');
    note(suggestions, 'Suggestions come from the comments on this post, so they need a live read too.');
    return;
  }

  head.textContent = 'Reading the comments…';
  note(themes, 'Reading the comments on this post.');
  note(suggestions, '');

  try {
    const d = await NOVA.call(`/api/v1/brands/${NOVA.brandId}/posts/insight`, {
      method: 'POST',
      body: JSON.stringify({
        permalink: post.permalink,
        caption: post.title,
        totalComments: num(post.comments) ?? undefined,
      }),
    });
    if (openPost !== post) return;   // a different post was opened meanwhile

    const list = Array.isArray(d.themes) ? d.themes : [];
    head.textContent = d.commentsRead
      ? `${d.commentsRead} comment${d.commentsRead === 1 ? '' : 's'} read${d.sentiment ? `, overall ${d.sentiment}` : ''}.`
      : 'No comments were readable on this post.';
    if (list.length) renderThemes(list);
    else note(themes, d.summary || 'No themes came back for this post.');

    const tips = Array.isArray(d.suggestions) ? d.suggestions : [];
    if (tips.length) renderSuggestions(tips);
    else note(suggestions, 'No suggestions came back for this post.');
  } catch (err) {
    if (openPost !== post) return;
    head.textContent = `Could not read the comments — ${err.message}`;
    note(themes, 'Nothing is shown here rather than showing figures we did not read.');
    note(suggestions, '');
    NOVA.notice(`Comment analysis failed — ${err.message}`);
  }
}

dialog?.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

/* ---- NuNu -------------------------------------------------------- */

const nunuToggle = q('#nunuToggle');
const nunuLog = q('#nunuLog');
const nunuInput = q('#nunuInput');
const nunuSend = q('#nunuSend');

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

/** The design's own bubbles, cloned so a live answer looks like the mocked one. */
const userBubble = nunuLog ? [...nunuLog.children].find((c) => c.children.length === 0) : null;
const botBubble = nunuLog ? [...nunuLog.children].find((c) => c.children.length === 2) : null;

const history = [];
let sending = false;

function addBubble(who, text) {
  if (!nunuLog) return null;
  const template = who === 'user' ? userBubble : botBubble;
  if (!template) return null;
  const el = template.cloneNode(true);
  const body = who === 'user' ? el : el.children[1];
  body.textContent = text;
  nunuLog.appendChild(el);
  nunuLog.scrollTop = nunuLog.scrollHeight;
  return body;
}

async function ask(text) {
  const question = text.trim();
  if (!question || sending) return;
  if (nunuInput) nunuInput.value = '';
  addBubble('user', question);

  if (!NOVA.live()) {
    // Saying nothing was the old behaviour: the field kept the text, no request
    // was made, and the panel looked broken.
    addBubble('bot', 'I answer from the live worker, and no key is set on this page. Add #key=… to the URL and ask again.');
    return;
  }

  sending = true;
  if (nunuSend) nunuSend.disabled = true;
  const pending = addBubble('bot', 'Thinking…');
  history.push({ role: 'user', content: question });

  try {
    const d = await NOVA.call(`/api/v1/brands/${NOVA.brandId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ companyName: D.brand, messages: history.slice(-20) }),
    });
    const answer = typeof d.content === 'string' && d.content.trim() ? d.content : 'No answer came back.';
    if (pending) pending.textContent = answer;
    history.push({ role: 'assistant', content: answer });
  } catch (err) {
    if (pending) pending.textContent = `I could not reach the worker — ${err.message}`;
    history.pop();   // an unanswered turn must not poison the next request
    NOVA.notice(`NuNu could not answer — ${err.message}`);
  } finally {
    sending = false;
    if (nunuSend) nunuSend.disabled = false;
    if (nunuLog) nunuLog.scrollTop = nunuLog.scrollHeight;
  }
}

nunuSend?.addEventListener('click', (e) => { e.preventDefault(); ask(nunuInput?.value || ''); });
nunuInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); ask(nunuInput.value); }
});
qa('[data-ask]').forEach((chip) => chip.addEventListener('click', (e) => {
  e.preventDefault();
  ask(chip.dataset.ask);
}));

q('#dlgAsk')?.addEventListener('click', (e) => {
  e.preventDefault();
  const title = openPost?.title || 'this post';
  dialog?.close();
  ask(`How did this post do compared with the others: "${title}"?`);
});

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
  if (nunuLog) nunuLog.scrollTop = nunuLog.scrollHeight;
}

nunuToggle?.addEventListener('click', (e) => {
  // Without this the click also reaches the document handler below and the
  // panel closes again in the same tick.
  e.preventDefault();
  e.stopPropagation();
  setNunuFull(!nunuPanel?.classList.contains('nunu-max'));
});

// One handler, one layer per press. Two independent Escape listeners used to
// fire on the same keypress and close the dialog and the panel together.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (dialog?.open) { e.preventDefault(); dialog.close(); return; }
  if (nunuPanel?.classList.contains('nunu-max')) setNunuFull(false);
});

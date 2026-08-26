/**
 * Campaigns, and the creators inside them.
 *
 * The worker has carried `/campaigns`, `/campaign-posts` and
 * `/campaign-creators` since the campaigns commit, and nothing in the browser
 * ever called any of them. A feature only curl can reach is a feature nobody
 * can review, so this page is the whole surface: create, paste, filter, and the
 * creator list the filter is built from.
 *
 * One page rather than three, because the three reads are one question. The
 * creator list is literally the post filter's own options, which is why the
 * worker returns it as its own route instead of letting a browser derive it
 * from whatever page of posts happens to be loaded.
 */
(() => {
  if (!NOVA.requireSignIn()) return;

  const $ = (id) => document.getElementById(id);

  const brandId = NOVA.brandId;
  $('cpWho').textContent = NOVA.email;
  $('cpOut').addEventListener('click', () => {
    NOVA.signOut();
    location.replace('./');
  });

  /**
   * An operator signs in scoped to nobody until they open a brand, so every
   * call below would 400 on an empty brand id in the path. Say that instead.
   */
  if (!brandId) {
    $('cpBody').hidden = true;
    $('cpNoBrand').hidden = false;
    return;
  }

  const escape = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );

  const day = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ''
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const TYPE_LABEL = {
    awareness: 'Awareness',
    launch: 'Launch',
    seasonal: 'Seasonal',
    always_on: 'Always on',
    other: 'Other',
  };
  const PLATFORM_LABEL = {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    youtube: 'YouTube',
    facebook: 'Facebook',
  };

  /**
   * A date input yields `2026-08-26`, and the worker's query schema demands a
   * full ISO datetime. `to` takes the end of its day rather than the start, or
   * filtering "to today" silently excludes everything added today.
   */
  const startOfDay = (v) => (v ? `${v}T00:00:00.000Z` : '');
  const endOfDay = (v) => (v ? `${v}T23:59:59.999Z` : '');

  let campaigns = [];
  let selected = '';

  /* ---- campaigns ---------------------------------------------------- */

  async function loadCampaigns() {
    const el = $('cpList');
    try {
      const body = await NOVA.call(`/api/v1/brands/${encodeURIComponent(brandId)}/campaigns`);
      campaigns = body.campaigns || [];
    } catch (err) {
      el.innerHTML = `<div class="empty">${escape(err.message)}</div>`;
      return;
    }

    if (!campaigns.length) {
      el.innerHTML =
        '<div class="empty">No campaigns yet. Create one above, then paste in the post links that belong to it. ' +
        'A campaign is how a paid push gets separated from everything else this brand posts.</div>';
      syncCampaignFilter();
      return;
    }

    el.innerHTML = campaigns
      .map((c) => {
        const window_ = [day(c.startsAt), day(c.endsAt)].filter(Boolean).join(' to ');
        const meta = [TYPE_LABEL[c.type] || c.type, window_ || `created ${day(c.createdAt)}`]
          .filter(Boolean)
          .join(' · ');
        const status = c.status === 'live' ? '<span class="tag live">Live</span>' : `<span class="tag">${escape(c.status)}</span>`;
        return `
        <div class="row pick${c.id === selected ? ' on' : ''}" data-campaign="${escape(c.id)}">
          <div class="grow">
            <div class="name">${escape(c.name)}</div>
            <div class="meta">${escape(meta)}</div>
          </div>
          ${status}
        </div>`;
      })
      .join('');
    syncCampaignFilter();
  }

  $('cpList').addEventListener('click', (e) => {
    const row = e.target.closest('[data-campaign]');
    if (!row) return;
    // Clicking the selected one again clears it, so there is a way back to
    // "all campaigns" without hunting for the filter.
    selected = row.dataset.campaign === selected ? '' : row.dataset.campaign;
    for (const r of $('cpList').querySelectorAll('.row')) {
      r.classList.toggle('on', r.dataset.campaign === selected);
    }
    $('fCampaign').value = selected;
    syncPasteGate();
    loadPosts();
  });

  function syncCampaignFilter() {
    const sel = $('fCampaign');
    sel.innerHTML =
      '<option value="">All campaigns</option>' +
      campaigns.map((c) => `<option value="${escape(c.id)}">${escape(c.name)}</option>`).join('');
    sel.value = selected;
    syncPasteGate();
  }

  function syncPasteGate() {
    const picked = campaigns.find((c) => c.id === selected);
    $('cpPasteGate').hidden = Boolean(picked);
    $('cpPasteForm').hidden = !picked;
    if (picked) $('cpPasteHint').textContent = `Up to 200 links in one go, into ${picked.name}.`;
  }

  /* ---- create ------------------------------------------------------- */

  $('cpNewToggle').addEventListener('click', () => {
    const panel = $('cpNewPanel');
    panel.hidden = !panel.hidden;
    $('cpNewToggle').textContent = panel.hidden ? 'New campaign' : 'Cancel';
    if (!panel.hidden) $('cpName').focus();
  });

  $('cpCreate').addEventListener('click', async () => {
    const button = $('cpCreate');
    const name = $('cpName').value.trim();
    if (!name) {
      NOVA.notice('A campaign needs a name.');
      $('cpName').focus();
      return;
    }
    const payload = { name, type: $('cpType').value };
    const starts = startOfDay($('cpStarts').value);
    const ends = endOfDay($('cpEnds').value);
    if (starts) payload.startsAt = starts;
    if (ends) payload.endsAt = ends;

    button.disabled = true;
    button.textContent = 'Creating…';
    try {
      const { campaign } = await NOVA.call(`/api/v1/brands/${encodeURIComponent(brandId)}/campaigns`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      // Land on the thing that was just made, so the next step is obvious.
      selected = campaign.id;
      $('cpName').value = '';
      $('cpStarts').value = '';
      $('cpEnds').value = '';
      $('cpNewPanel').hidden = true;
      $('cpNewToggle').textContent = 'New campaign';
      await loadCampaigns();
      await loadPosts();
      NOVA.notice(`Created ${campaign.name}. Paste its post links below.`);
    } catch (err) {
      NOVA.notice(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Create campaign';
    }
  });

  /* ---- bulk paste ---------------------------------------------------- */

  /**
   * Every pasted link is reported on individually.
   *
   * The worker deliberately answers with a row per URL rather than a count,
   * because "38 of 50 added" with no way to see which twelve failed is worse
   * than a plain error. That detail is the whole point of the endpoint, so it
   * is rendered rather than summarised away.
   */
  $('cpAdd').addEventListener('click', async () => {
    const button = $('cpAdd');
    const urls = $('cpUrls').value.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!urls.length) {
      NOVA.notice('Nothing pasted yet.');
      return;
    }
    if (urls.length > 200) {
      NOVA.notice(`That is ${urls.length} links. The worker takes 200 at a time.`);
      return;
    }

    button.disabled = true;
    button.textContent = 'Adding…';
    try {
      const body = await NOVA.call(
        `/api/v1/brands/${encodeURIComponent(brandId)}/campaigns/${encodeURIComponent(selected)}/posts`,
        { method: 'POST', body: JSON.stringify({ urls }) }
      );
      renderReport(body);
      if (body.added > 0) $('cpUrls').value = '';
      await Promise.all([loadPosts(), loadCreators()]);
    } catch (err) {
      NOVA.notice(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Add to campaign';
    }
  });

  const REASON = {
    unrecognised: 'not a post link we can read',
    duplicate: 'already in this campaign',
  };

  function renderReport({ added, skipped, results }) {
    const tally =
      `${added} added` + (skipped ? `, ${skipped} skipped` : '') + '.';
    const lines = (results || [])
      .map((r) => {
        const verdict = r.ok
          ? `<span class="verdict ok">${escape(PLATFORM_LABEL[r.platform] || r.platform)}</span>`
          : `<span class="verdict no">${escape(REASON[r.reason] || r.reason || 'skipped')}</span>`;
        return `<div class="rline"><span class="u">${escape(r.url)}</span>${verdict}</div>`;
      })
      .join('');
    $('cpReport').innerHTML = `<div class="tally">${escape(tally)}</div>${lines}`;
    $('cpReport').hidden = false;
  }

  /* ---- posts ---------------------------------------------------------- */

  function platformFilters() {
    return [...document.querySelectorAll('[data-plat]')]
      .filter((c) => c.checked)
      .map((c) => c.dataset.plat);
  }

  async function loadPosts() {
    const el = $('cpPosts');
    const head =
      '<div class="phead prow"><span>Platform</span><span>Post</span><span>Creator</span><span>Added</span></div>';

    const limit = $('fLimit').value;
    const params = new URLSearchParams();
    if ($('fCampaign').value) params.set('campaignId', $('fCampaign').value);
    if ($('fCreator').value) params.set('creator', $('fCreator').value);
    if ($('fFrom').value) params.set('from', startOfDay($('fFrom').value));
    if ($('fTo').value) params.set('to', endOfDay($('fTo').value));
    params.set('limit', limit);
    // Repeatable, not comma-joined: the schema is a union of one enum or an
    // array of them, and `?platform=a,b` matches neither.
    for (const p of platformFilters()) params.append('platform', p);

    let posts;
    try {
      const body = await NOVA.call(
        `/api/v1/brands/${encodeURIComponent(brandId)}/campaign-posts?${params.toString()}`
      );
      posts = body.posts || [];
    } catch (err) {
      el.innerHTML = head + `<div class="empty">${escape(err.message)}</div>`;
      $('cpCount').textContent = '';
      return;
    }

    if (!posts.length) {
      const filtered =
        $('fCampaign').value || $('fCreator').value || $('fFrom').value || $('fTo').value || platformFilters().length;
      el.innerHTML =
        head +
        `<div class="empty">${
          filtered
            ? 'Nothing matches those filters. Clear them to see everything this brand has.'
            : 'No posts tracked yet. Pick a campaign above and paste the links to the posts you paid for.'
        }</div>`;
      $('cpCount').textContent = '';
      return;
    }

    el.innerHTML =
      head +
      posts
        .map(
          (p) => `
        <div class="prow">
          <span class="plat">${escape(PLATFORM_LABEL[p.platform] || p.platform)}</span>
          <a class="pid" href="${escape(p.url)}" target="_blank" rel="noopener noreferrer">${escape(p.postId)}</a>
          <span class="pcre${p.creatorHandle ? '' : ' none'}">${escape(p.creatorHandle ? `@${p.creatorHandle}` : 'not named')}</span>
          <span class="pwhen">${escape(day(p.addedAt))}</span>
        </div>`
        )
        .join('');

    /**
     * The list is always limited, so a full page is ambiguous by construction:
     * it could be all there is, or the first slice of far more. Say which.
     */
    const capped = posts.length >= Number(limit);
    $('cpCount').textContent = capped
      ? `Showing the newest ${posts.length}. There may be more past this limit.`
      : `${posts.length} post${posts.length === 1 ? '' : 's'}.`;
  }

  for (const el of [$('fCampaign'), $('fCreator'), $('fFrom'), $('fTo'), $('fLimit')]) {
    el.addEventListener('change', () => {
      if (el === $('fCampaign')) {
        selected = el.value;
        for (const r of $('cpList').querySelectorAll('.row')) {
          r.classList.toggle('on', r.dataset.campaign === selected);
        }
        syncPasteGate();
      }
      loadPosts();
    });
  }
  for (const c of document.querySelectorAll('[data-plat]')) {
    c.addEventListener('change', loadPosts);
  }

  $('cpClear').addEventListener('click', () => {
    selected = '';
    $('fCampaign').value = '';
    $('fCreator').value = '';
    $('fFrom').value = '';
    $('fTo').value = '';
    $('fLimit').value = '200';
    for (const c of document.querySelectorAll('[data-plat]')) c.checked = false;
    for (const chip of $('cpCreators').querySelectorAll('.chip')) chip.classList.remove('on');
    for (const r of $('cpList').querySelectorAll('.row')) r.classList.remove('on');
    syncPasteGate();
    loadPosts();
  });

  /* ---- creators -------------------------------------------------------- */

  async function loadCreators() {
    const el = $('cpCreators');
    const emptyEl = $('cpCreatorsEmpty');
    let creators;
    try {
      const body = await NOVA.call(`/api/v1/brands/${encodeURIComponent(brandId)}/campaign-creators`);
      creators = body.creators || [];
    } catch (err) {
      el.innerHTML = '';
      emptyEl.hidden = false;
      emptyEl.firstElementChild.textContent = err.message;
      return;
    }

    const picked = $('fCreator').value;
    $('fCreator').innerHTML =
      '<option value="">Anyone</option>' +
      creators.map((h) => `<option value="${escape(h)}">@${escape(h)}</option>`).join('');
    $('fCreator').value = creators.includes(picked) ? picked : '';

    if (!creators.length) {
      el.innerHTML = '';
      emptyEl.hidden = false;
      /**
       * The honest reason, not "no data". A URL identifies the post reliably
       * and the creator almost never: only TikTok puts the handle in the path.
       * Somebody looking at an empty list after pasting fifty Instagram links
       * needs to know that is the platform, not a broken page.
       */
      emptyEl.firstElementChild.innerHTML =
        'No creators named yet. Only TikTok links carry the handle in the URL, so Instagram and YouTube posts ' +
        'stay blank until a lookup fills them in. <strong>An empty list here means not known yet, never no creator.</strong>';
      return;
    }

    emptyEl.hidden = true;
    el.innerHTML = creators
      .map((h) => `<button class="chip${h === picked ? ' on' : ''}" data-creator="${escape(h)}">@${escape(h)}</button>`)
      .join('');
  }

  $('cpCreators').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-creator]');
    if (!chip) return;
    const handle = chip.dataset.creator;
    const next = $('fCreator').value === handle ? '' : handle;
    $('fCreator').value = next;
    for (const c of $('cpCreators').querySelectorAll('.chip')) c.classList.toggle('on', c.dataset.creator === next);
    loadPosts();
  });

  /* ---- go -------------------------------------------------------------- */

  loadCampaigns();
  loadPosts();
  loadCreators();
})();

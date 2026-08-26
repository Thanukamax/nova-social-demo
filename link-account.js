/**
 * Connecting an account, for real.
 *
 * The wizard in start.html looks a handle up and then stops: its final action
 * is `onConfirm: () => go(4)`, which advances the screen and calls nothing. So
 * a brand could walk the whole flow, see a success page, and have no
 * connection — the dashboard stayed empty and nothing said why.
 *
 * The worker has carried the missing half since the handle-claim commit:
 * `handle-claim` issues a one-time code, and `confirm-handle` reads the live
 * bio and creates the connection only if the code is there. That challenge is
 * the point. Before it, `confirm-handle` trusted the caller, so any approved
 * brand could claim a competitor's handle.
 */
(() => {
  if (!NOVA.requireSignIn()) return;

  const $ = (id) => document.getElementById(id);
  const brandId = NOVA.brandId;

  $('lkWho').textContent = NOVA.email;
  $('lkOut').addEventListener('click', () => {
    NOVA.signOut();
    location.replace('./');
  });

  if (!brandId) {
    $('lkBody').hidden = true;
    $('lkNoBrand').hidden = false;
    return;
  }

  const escape = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );

  const PLATFORM = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook' };
  const num = (n) => (typeof n === 'number' ? n.toLocaleString('en-GB') : null);

  const when = (iso) => {
    if (!iso) return 'never synced';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return 'never synced';
    return `synced ${d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  };

  const base = `/api/v1/brands/${encodeURIComponent(brandId)}`;
  let found = null;

  /* ---- what is already connected -------------------------------------- */

  async function loadConnections() {
    const el = $('lkConns');
    let connections;
    try {
      ({ connections } = await NOVA.call(`${base}/connections`));
    } catch (err) {
      el.innerHTML = `<div class="empty">${escape(err.message)}</div>`;
      return;
    }

    if (!connections.length) {
      el.innerHTML =
        '<div class="empty">Nothing connected yet. Use the form below, and the first numbers land once the queued sync runs.</div>';
      return;
    }

    el.innerHTML = connections
      .map((c) => {
        const bad = c.status !== 'active';
        const meta = [PLATFORM[c.platform] || c.platform, when(c.lastSyncedAt), c.lastError || '']
          .filter(Boolean)
          .join(' · ');
        return `
        <div class="row">
          ${c.avatarUrl ? `<img class="avatar" src="${escape(c.avatarUrl)}" alt="">` : '<span class="avatar"></span>'}
          <div class="grow">
            <div class="name">${escape(c.accountHandle ? `@${c.accountHandle}` : c.displayName || c.accountId)}</div>
            <div class="meta">${escape(meta)}</div>
          </div>
          <span class="tag ${bad ? 'bad' : 'ok'}">${escape(c.status)}</span>
          <button class="ghost" data-sync="${escape(c.id)}">Sync now</button>
          <button class="danger" data-drop="${escape(c.id)}">Disconnect</button>
        </div>`;
      })
      .join('');
  }

  $('lkConns').addEventListener('click', async (e) => {
    const sync = e.target.closest('[data-sync]');
    const drop = e.target.closest('[data-drop]');
    const button = sync || drop;
    if (!button) return;

    // Disconnecting destroys the stored tokens and cannot be undone from here,
    // so it asks. Syncing is safe and does not.
    if (drop && !confirm('Disconnect this account? The stored tokens are destroyed and the history stops here.')) return;

    const label = button.textContent;
    button.disabled = true;
    button.textContent = '…';
    try {
      if (sync) {
        await NOVA.call(`/api/v1/connections/${encodeURIComponent(sync.dataset.sync)}/sync`, { method: 'POST', body: '{}' });
        NOVA.notice('Sync queued. Refresh the dashboard in a moment.');
      } else {
        await NOVA.call(`/api/v1/connections/${encodeURIComponent(drop.dataset.drop)}`, { method: 'DELETE' });
      }
      await loadConnections();
    } catch (err) {
      NOVA.notice(err.message);
      button.disabled = false;
      button.textContent = label;
    }
  });

  /* ---- step 1, the lookup ---------------------------------------------- */

  $('lkLookup').addEventListener('click', async () => {
    const button = $('lkLookup');
    const platform = $('lkPlat').value;
    const handle = $('lkHandle').value.trim().replace(/^@/, '');
    if (!handle) {
      NOVA.notice('Type the handle first.');
      return;
    }

    // Reset everything downstream: a second lookup must not leave the code or
    // the confirm button from the previous handle on screen.
    found = null;
    $('lkStep2').hidden = true;
    $('lkStep3').hidden = true;
    $('lkCode').hidden = true;
    $('lkRefusal').hidden = true;

    button.disabled = true;
    button.textContent = 'Looking…';
    try {
      const body = await NOVA.call(`${base}/verify-handle`, {
        method: 'POST',
        body: JSON.stringify({ platform, handle, companyName: handle }),
      });
      if (!body.found || !body.account) {
        NOVA.notice(`No ${PLATFORM[platform]} account called @${handle}.`);
        return;
      }
      found = body.account;
      renderFound();
      $('lkStep2').hidden = false;
    } catch (err) {
      NOVA.notice(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Look it up';
    }
  });

  function renderFound() {
    const followers = num(found.followers);
    const meta = [
      PLATFORM[found.platform] || found.platform,
      followers ? `${followers} followers` : 'follower count unavailable',
      found.verified ? 'verified' : '',
    ]
      .filter(Boolean)
      .join(' · ');
    $('lkFound').innerHTML =
      `${found.avatarUrl ? `<img class="avatar" src="${escape(found.avatarUrl)}" alt="">` : '<span class="avatar"></span>'}
       <div class="grow">
         <div class="name">@${escape(found.handle)}${found.displayName ? ` · ${escape(found.displayName)}` : ''}</div>
         <div class="meta">${escape(meta)}</div>
       </div>`;
    $('lkWarn').hidden = !found.warning;
    if (found.warning) $('lkWarn').textContent = found.warning;
  }

  /* ---- step 2, the challenge -------------------------------------------- */

  $('lkClaim').addEventListener('click', async () => {
    const button = $('lkClaim');
    button.disabled = true;
    button.textContent = 'Opening…';
    try {
      const { code, expiresAt, instructions } = await NOVA.call(`${base}/handle-claim`, {
        method: 'POST',
        body: JSON.stringify({ platform: found.platform, handle: found.handle }),
      });
      const until = new Date(expiresAt);
      $('lkCode').innerHTML =
        `<b>${escape(code)}</b><span>${escape(instructions)}${
          Number.isNaN(until.getTime())
            ? ''
            : ` Expires ${until.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`
        }</span>`;
      $('lkCode').hidden = false;
      $('lkStep3').hidden = false;
    } catch (err) {
      NOVA.notice(err.message);
    } finally {
      button.disabled = false;
      button.textContent = 'This is ours, get the code';
    }
  });

  /* ---- step 3, the check ------------------------------------------------ */

  /**
   * Every refusal names itself. The worker fails closed with a `reason` rather
   * than a bare 409, and each one needs a different action from the person
   * reading it: waiting, re-pasting, or starting over.
   */
  const REFUSAL = {
    no_claim: 'No open claim for this handle. Get a fresh code above.',
    expired: 'That code expired. Get a fresh one above and try again.',
    code_absent:
      'The code is not in the bio yet. Instagram can take a moment to save, and a bio edited in the app sometimes needs a reload before it is public. Check the profile, then try again.',
    too_many_attempts: 'Too many checks against this claim. Get a fresh code above.',
    profile_unreadable:
      'The profile could not be read. A private account cannot be verified this way, since the bio has to be publicly visible.',
  };

  $('lkConfirm').addEventListener('click', async () => {
    const button = $('lkConfirm');
    button.disabled = true;
    button.textContent = 'Checking the bio…';
    $('lkRefusal').hidden = true;
    try {
      const { connectionId, tier } = await NOVA.call(`${base}/confirm-handle`, {
        method: 'POST',
        body: JSON.stringify({
          platform: found.platform,
          handle: found.handle,
          displayName: found.displayName ?? undefined,
        }),
      });
      NOVA.notice(`Connected @${found.handle} on the ${tier} tier. First sync queued.`);
      $('lkStep2').hidden = true;
      $('lkStep3').hidden = true;
      $('lkHandle').value = '';
      found = null;
      await loadConnections();
      // eslint-disable-next-line no-console
      console.info('connection created', connectionId);
    } catch (err) {
      const reason = err.detail && err.detail.reason;
      $('lkRefusal').textContent = REFUSAL[reason] || err.message;
      $('lkRefusal').hidden = false;
    } finally {
      button.disabled = false;
      button.textContent = 'I have added it, check now';
    }
  });

  loadConnections();
})();

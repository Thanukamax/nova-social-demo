/**
 * The operator console.
 *
 * Until now the only admin surface was curl. An operator could approve a brand
 * through the API and then had no way to see it again — approval dropped it out
 * of the pending queue and nothing else listed it.
 */
(() => {
  if (!NOVA.requireSignIn()) return;
  if (!NOVA.isAdmin()) { location.replace('./dashboard.html'); return; }

  const requestsEl = document.getElementById('adRequests');
  const brandsEl = document.getElementById('adBrands');
  const onceEl = document.getElementById('adOnce');
  document.getElementById('adWho').textContent = NOVA.email;
  document.getElementById('adOut').addEventListener('click', () => {
    NOVA.signOut();
    location.replace('./');
  });

  const escape = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]
    );

  const day = (iso) => {
    if (!iso) return 'unknown date';
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? 'unknown date'
      : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  function fill(el, rows, emptyMessage) {
    el.innerHTML = rows.length ? rows.join('') : `<div class="empty">${escape(emptyMessage)}</div>`;
  }

  /* ---- pending access requests ------------------------------------- */

  async function loadRequests() {
    let body;
    try {
      body = await NOVA.call('/api/v1/admin/requests?status=pending');
    } catch (err) {
      fill(requestsEl, [], err.message);
      return;
    }
    fill(
      requestsEl,
      body.requests.map(
        (r) => `
        <div class="row" data-request="${escape(r.id)}">
          <div class="grow">
            <div class="name">${escape(r.company)}</div>
            <div class="meta">${escape(r.contactName)} · ${escape(r.designation)} · ${escape(r.email)} · asked ${escape(day(r.createdAt))}</div>
          </div>
          <button class="primary" data-approve="${escape(r.id)}">Approve</button>
          <button class="danger" data-reject="${escape(r.id)}">Reject</button>
        </div>`
      ),
      'Nothing waiting. New access requests land here.'
    );
  }

  /**
   * The temporary password is returned exactly once, by this response. It is
   * never stored in readable form and no later screen can show it again, so it
   * is put on screen plainly rather than in a toast that can be missed.
   */
  function showOnce(result) {
    onceEl.innerHTML =
      `Approved <strong>${escape(result.email)}</strong>. Their one-time password is ` +
      `<code>${escape(result.tempPassword)}</code> — copy it now and send it to them. ` +
      `It cannot be shown again.`;
    onceEl.hidden = false;
  }

  async function act(button, id, path, after) {
    const row = button.closest('.row');
    for (const b of row.querySelectorAll('button')) b.disabled = true;
    button.textContent = '…';
    try {
      const result = await NOVA.call(path, { method: 'POST', body: '{}' });
      after(result);
      await Promise.all([loadRequests(), loadBrands()]);
    } catch (err) {
      NOVA.notice(err.message);
      for (const b of row.querySelectorAll('button')) b.disabled = false;
      button.textContent = button.dataset.approve ? 'Approve' : 'Reject';
    }
  }

  requestsEl.addEventListener('click', (e) => {
    const approve = e.target.closest('[data-approve]');
    if (approve) {
      return act(approve, approve.dataset.approve, `/api/v1/admin/requests/${approve.dataset.approve}/approve`, showOnce);
    }
    const reject = e.target.closest('[data-reject]');
    if (reject) {
      return act(reject, reject.dataset.reject, `/api/v1/admin/requests/${reject.dataset.reject}/reject`, () => {});
    }
  });

  /* ---- brands ------------------------------------------------------- */

  async function loadBrands() {
    let body;
    try {
      body = await NOVA.call('/api/v1/admin/brands');
    } catch (err) {
      fill(brandsEl, [], err.message);
      return;
    }
    fill(
      brandsEl,
      body.brands.map((b) => {
        const connections = b.connections === 1 ? '1 account connected' : `${b.connections} accounts connected`;
        const seen = b.lastLoginAt ? `last signed in ${day(b.lastLoginAt)}` : 'never signed in';
        return `
        <div class="row">
          <div class="grow">
            <div class="name">${escape(b.company)}</div>
            <div class="meta">${escape(b.brandId)} · ${escape(connections)} · ${escape(seen)}</div>
          </div>
          ${b.status === 'active' ? '' : `<span class="tag">${escape(b.status)}</span>`}
          <button class="ghost" data-open="${escape(b.brandId)}">Open →</button>
        </div>`;
      }),
      'No brands yet. Approve a request above and it appears here.'
    );
  }

  brandsEl.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (!open) return;
    NOVA.viewBrand(open.dataset.open);
    location.href = './dashboard.html';
  });

  loadRequests();
  loadBrands();
})();

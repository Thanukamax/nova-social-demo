/**
 * Request access, for real.
 *
 * The button used to carry `data-go="./"` — it navigated whatever you typed, so
 * every request a brand believed it had sent went nowhere and no operator ever
 * saw it. The sign-in page had the same defect and was fixed months earlier;
 * this one was missed because nothing ever asserted a request arrived.
 *
 * `/api/v1/access/request` needs no key: it is one of the three front-door
 * routes, rate limited per client IP rather than gated on a shared secret.
 */
(() => {
  const field = (id) => document.getElementById(id);
  const button = field('rqGo');
  const error = field('rqError');
  if (!button) return;

  const inputs = {
    company: field('rqCompany'),
    registrationNo: field('rqReg'),
    email: field('rqEmail'),
    contactName: field('rqName'),
    designation: field('rqRole'),
  };

  const LABELS = {
    company: 'the company name',
    registrationNo: 'the registration number',
    email: 'a contact email',
    contactName: 'a contact name',
    designation: 'a designation',
  };

  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Send request';
  }

  button.addEventListener('click', async () => {
    error.hidden = true;

    const body = {};
    for (const [key, el] of Object.entries(inputs)) {
      const value = el?.value.trim() ?? '';
      // Named individually rather than "fill in all fields": the worker rejects
      // the whole payload on one missing value, and a form that will not say
      // which one is a form people abandon.
      if (!value) return fail(`Add ${LABELS[key]} before sending.`);
      body[key] = value;
    }

    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const res = await fetch(`${NOVA.url}/api/v1/access/request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status === 429) return fail('Too many requests from here. Wait a minute and try again.');
      if (!res.ok) return fail(`That did not send — the worker answered ${res.status}.`);

      // Nothing to sign in to yet, so say what actually happens next rather
      // than dropping them on a login they cannot pass.
      button.textContent = 'Request sent';
      error.style.color = '#5C5C68';
      error.textContent = 'Nova will review it and email you a password once the account exists.';
      error.hidden = false;
    } catch {
      fail('The worker could not be reached.');
    }
  });
})();

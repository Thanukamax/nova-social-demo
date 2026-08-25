/**
 * The front door.
 *
 * One form for two kinds of account. Brands live in `brand_accounts` and
 * operators in `admin_users`, behind two different endpoints — but making the
 * person choose the right one first is making them know the schema. NOVA.login
 * tries both; this file only decides where the answer sends them.
 */
(() => {
  const email = document.getElementById('siEmail');
  const password = document.getElementById('siPassword');
  const button = document.getElementById('siGo');
  const error = document.getElementById('siError');
  if (!email || !password || !button) return;

  /**
   * Someone already signed in still gets the form.
   *
   * This used to redirect them straight through, which sounds helpful and is
   * not: the sign-in page became unreachable in that tab. There was no way to
   * look at it, no way to sign in as somebody else, and no way to check the
   * thing you had just changed. Offer the shortcut, never take it for them.
   */
  if (NOVA.signedIn()) {
    const where = NOVA.isAdmin() ? './admin.html' : './dashboard.html';
    const bar = document.createElement('p');
    bar.style.cssText =
      'margin:20px 0 0;padding:13px 15px;background:#F2F2F5;border-radius:14px;' +
      'font-size:13px;line-height:1.5;color:#5C5C68';
    bar.innerHTML =
      `Already signed in as <strong style="color:#0F0F14"></strong>. ` +
      `<a href="${where}" style="font-weight:600">Continue</a> or ` +
      `<a href="#" id="siOut" style="font-weight:600">sign out</a>.`;
    bar.querySelector('strong').textContent = NOVA.email;
    button.insertAdjacentElement('afterend', bar);
    bar.querySelector('#siOut').addEventListener('click', (e) => {
      e.preventDefault();
      NOVA.signOut();
      location.reload();
    });
  }

  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Sign in';
  }

  async function submit() {
    error.hidden = true;
    if (!email.value.trim() || !password.value) {
      return fail('Enter your email and password.');
    }

    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      const { role } = await NOVA.login(email.value.trim(), password.value);
      // Resume whatever page sent them here, if anything did.
      const next = NOVA.consumeNext();
      if (next && next !== 'index.html' && next !== 'signin.html') {
        location.href = `./${next}`;
        return;
      }
      location.href = role === 'admin' ? './admin.html' : './dashboard.html';
    } catch (err) {
      fail(err.message || 'Sign-in failed.');
    }
  }

  button.addEventListener('click', submit);
  for (const field of [email, password]) {
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }
})();

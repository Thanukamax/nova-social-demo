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

  // Already signed in and arriving at the front door again: don't make them
  // type it twice.
  if (NOVA.signedIn()) {
    location.replace(NOVA.isAdmin() ? './admin.html' : './dashboard.html');
    return;
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

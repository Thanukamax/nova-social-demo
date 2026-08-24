/**
 * Real sign-in.
 *
 * The button used to navigate to the dashboard whatever you typed, which was
 * fine while every page read captured data. It is not fine now: the dashboard's
 * live calls need a session bound to a brand, and only a real login mints one.
 */
(() => {
  const email = document.getElementById('siEmail');
  const password = document.getElementById('siPassword');
  const button = document.getElementById('siGo');
  const error = document.getElementById('siError');
  if (!email || !password || !button) return;

  function fail(message) {
    error.textContent = message;
    error.hidden = false;
    button.disabled = false;
    button.textContent = 'Sign in';
  }

  async function submit() {
    error.hidden = true;

    // Without the worker key there is nothing to sign in against, and a
    // "wrong password" message would be a lie.
    if (!NOVA.live() && !NOVA.promptForKey()) {
      return fail('This build needs the worker key before it can sign anyone in.');
    }
    if (!email.value.trim() || !password.value) {
      return fail('Enter your email and password.');
    }

    button.disabled = true;
    button.textContent = 'Signing in…';
    try {
      await NOVA.login(email.value.trim(), password.value);
      location.href = './dashboard.html';
    } catch (err) {
      fail(err.message || 'Sign-in failed.');
    }
  }

  button.addEventListener('click', submit);
  for (const field of [email, password]) {
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  }

  // Arriving with credentials already in the fragment should not make someone
  // retype them just to prove the flow works.
  if (NOVA.email) email.value = NOVA.email;
})();

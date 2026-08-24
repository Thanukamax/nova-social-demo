/** Sign in and Request access are static in the design; only the links move. */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  e.preventDefault();
  const to = { onSignIn: './dashboard.html', onRequest: './request.html' }[el.dataset.action];
  if (to) window.location.href = to;
});

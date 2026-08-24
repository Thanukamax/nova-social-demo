/** Cross-page navigation for the buttons the design already draws. */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-go]');
  if (!el) return;
  e.preventDefault();
  window.location.href = el.dataset.go;
});

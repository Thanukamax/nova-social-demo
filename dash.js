/**
 * Dashboard — the design's own markup and figures.
 *
 * Any row in Top posts opens the post detail, which is artboard 1e rendered
 * into a dialog rather than a separate page: the design shows it as an overlay
 * on the dashboard, not a navigation.
 */
const dialog = document.getElementById('postDialog');

document.querySelectorAll('a[href="#1e"], [data-post-row]').forEach((row) => {
  row.addEventListener('click', (e) => { e.preventDefault(); dialog?.showModal(); });
});

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el?.dataset.action === 'onNunuToggle') {
    // The design offers NuNu boxed or full-bleed; the toggle swaps between them.
    const panel = document.querySelector('[data-nunu]');
    if (panel) panel.classList.toggle('full');
  }
  if (dialog?.open && e.target === dialog) dialog.close();
});

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') dialog?.close(); });

# nova-social-demo — working rules

Rules for any coding agent in this repo (Claude Code, Antigravity/Gemini,
Cursor, or a human). `CLAUDE.md` and `GEMINI.md` point here so there is one
file to keep true.

The brand-facing UI for Nova Social. **Plain HTML, CSS and JS — no framework,
no build step, no package.json.** One `.html` per screen, one `.js` beside it,
`api.js` shared. Open a file in a browser and it runs.

## Running it

```bash
python3 -m http.server 8000     # then open http://localhost:8000
```

Any static server works. There is nothing to install and nothing to compile.

**It talks to the deployed dev worker, not a local one** —
`DEFAULT_URL` in `api.js` is
`https://nova-social-worker-dev.thanukamax321.workers.dev`. So the site works
on its own, with no worker running beside it. Point it at a local worker only
if you are changing the API at the same time.

## The screens

| Page | What |
|---|---|
| `index.html` | Connect flow |
| `signin.html` | Sign in — start here, nothing works signed out |
| `dashboard.html` | The numbers, plus post detail as a dialog |
| `campaigns.html` | Paste post links; platform is read off the URL |
| `link-account.html` | Entry point to the connect flow |
| `admin.html` | Operator console — approve and reject access requests |
| `request.html` | A brand asks for access |
| `review.html` | Review queue |
| `lockup.html` | Brand lockup |

## How auth works here, and why

There is no key in the page and no key in the URL. **A key in a URL is in the
browser history and the referrer log before the page finishes loading**, and
one leak was a leak for every brand at once. That is why the `#key=…` pattern
was removed — do not reintroduce it in any form.

Sign-in returns the key: operators get the internal key, brands get one derived
for their brand alone. It lives in `sessionStorage`, never `localStorage`.

The key is **not** secret from the person at the browser — everything the page
sends is visible in devtools. What it buys is that nothing travels in a URL,
that a leaked brand key names the brand it came from, and that a brand key
cannot act as an operator. Keep those three properties.

## House rules

- **No framework, no build step.** If a change seems to need React or a
  bundler, it does not belong in this repo.
- **Inline styles are the specification.** These pages were recreated
  pixel-perfectly from a design handoff and the inline styles carry it
  byte-for-byte. Do not "tidy" them into stylesheets.
- **`sessionStorage`, never `localStorage`,** for anything auth-shaped.
- **Never hardcode a key, token or secret.** There are none in this repo today;
  keep it that way.
- Every `fetch` goes through `api.js`. It owns the base URL, the timeout and
  the auth header — a bare `fetch` elsewhere silently skips all three.

## The worker

The API lives in `NovaDrop-lk/nova-social-worker`. Its `AGENTS.md` covers the
endpoints, the environments and its own traps. If a call 4xxs, read that before
changing this page — the contract is defined there, not here.

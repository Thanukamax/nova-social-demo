# nova-social-demo

The Nova Social screens from the Claude Design handoff, built as real pages.

**Live:** https://thanukamax.github.io/nova-social-demo/

| Page | Artboard |
|---|---|
| `index.html` | 1a connect flow, with 1b's namesake warning as a step-3 variant |
| `dashboard.html` | 1c dashboard, with 1e post detail as a dialog |
| `signin.html` | 1f |
| `request.html` | 1g |
| `lockup.html` | 1d |
| `review.html` | Review queue — not in the canvas; built from section 5 of the brief |

## How these were produced

The handoff README asks for the designs to be recreated pixel-perfectly, so the
prototype's inline styles are the specification and are carried across
byte-for-byte. Only the canvas-only constructs were translated:

- `sc-for` expanded at build time against the design's own `POSTS` and `dots`
- `sc-if` kept in the DOM as `data-when`, toggled by the step state
- `{{ bindings }}` resolved from the design's own state model
- `style-hover` / `style-active` hoisted into real CSS rules
- `onClick="{{ fn }}"` wired to real handlers

None of `support.js` ships. The state machine in `connect.js` is a port of the
prototype's own `Component` — same four steps, same 1600ms lookup pause, same
per-network tinting — rather than a reinterpretation.

The converter lives in `/tmp/conv/convert.py` during a rebuild; the pages here
are its output plus the hand-written handlers.

## Two notes the designer left in the canvas

Both are flagged in the design file as deviations from `DESIGN_BRIEF_SOCIAL.md`,
and both are honoured here:

- Figures and micro-labels use the Apple system face with tabular numerals
  rather than JetBrains Mono.
- Micro-labels sit at 12px rather than 10.5px, respecting the no-sub-12px rule.

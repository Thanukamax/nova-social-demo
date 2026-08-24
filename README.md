# nova-social-demo

Brand social onboarding UI for NovaDrop. Static, no build step.

**Live:** https://thanukamax.github.io/nova-social-demo/

## What it shows

The flow a brand goes through: pick a platform, enter a handle, and confirm the
account we found is theirs. It ends on the public tier, with the metrics that
need OAuth shown as locked rather than hidden.

Try `daraz.lk` or `kapruka`. Try `pizzahut` to see the warning that catches a
brand entering the worldwide account instead of their local one.

## Sample data by default, and why

GitHub Pages is public and static, so the worker's internal key cannot live in
this repository. The page therefore runs on sample data — real figures captured
from the live vendor on 2026-08-24, not invented ones.

To drive the real API, click **sample data** in the header and paste the key.
It is held in `sessionStorage` for that tab only and is sent to the worker and
nowhere else.

## Dashboard

`dashboard.html` is where the flow lands. Tiles carry the summary, a ranked
table shows top posts with in-row magnitude bars, and NuNu sits at the bottom.

Two deliberate choices worth knowing:

- **The follower trend is an empty state, not a sparkline.** There are two
  snapshots so far, taken minutes apart. Drawing a line through them would
  invent a shape the data does not have. It fills in as history accumulates,
  which is also the honest product story.
- **Platform identity is the label, not a colour.** Nova has one accent, and
  inventing a second hue to separate Instagram from TikTok would break the
  identity for no gain — the tiles are already named.

NuNu needs the live API. Without a key it says so rather than returning a
scripted answer, because a canned reply would misrepresent what it does.

## Design notes

Nova's own tokens: white ground, `#0F0F14` ink, one `#4F46E5` accent, Plus
Jakarta Sans, mono for figures.

Motion follows the measured Nova system — entry `500ms`, release `340ms`, a 1.5
ratio, on `cubic-bezier(0.16,1,0.3,1)`. Screens arrive deliberately and leave
without ceremony. The lookup step has a real waiting state because the live call
takes seconds and a snap would read as a hang. Everything is disabled under
`prefers-reduced-motion`.

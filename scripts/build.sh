#!/usr/bin/env bash
# Build the Cloudflare Pages bundle for social.novadrop.lk.
#
# This directory was previously assembled by hand, and it drifted: the live site
# at nova-social-qpr.pages.dev was serving an api.js with no session support
# long after the fix landed, and signin.js had never been copied across at all.
# A stale hand-copy is indistinguishable from a deploy that did not happen.
#
# Rebuilt from scratch every time, so the bundle cannot be older than the source.
set -euo pipefail
cd "$(dirname "$0")/.."

OUT=.cf-dist
rm -rf "$OUT"
mkdir -p "$OUT"

cp ./*.html ./*.js "$OUT"/

# Not generated from source, so it is written here rather than copied from a
# file that could itself go stale.
cat > "$OUT/_headers" <<'HEADERS'
/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: no-referrer
HEADERS

echo "built $OUT:"
ls -1 "$OUT" | sed 's/^/  /'

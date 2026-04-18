#!/usr/bin/env bash
set -euo pipefail

prerender_tmp="$(mktemp -d -t portfolio-prerender.XXXXXX)"

cleanup() {
  rm -rf "$prerender_tmp"
}

trap cleanup EXIT

pnpm exec auth migrate --yes
pnpm db:migrate

if [ "${ENABLE_AOT:-}" = "1" ]; then
  pnpm --filter @i2-labs/compiler build
  pnpm aot:compile
fi

# Pass 1: node-server preset — crawlable, produces prerendered HTML + sitemap.
# Required because the vercel preset + prerender is broken upstream
# (TanStack/router#6562 / nitrojs/nitro#3905).
# On Vercel CI, VERCEL=1 redirects Nitro output to .vercel/output/static
# (see apps/portfolio/vite.config.ts). Locally, node-server writes to
# .output/public. Handle both.
NITRO_PRESET=node-server pnpm build
if [ -d .vercel/output/static ]; then
  cp -R .vercel/output/static/. "$prerender_tmp/"
else
  cp -R .output/public/. "$prerender_tmp/"
fi

# Pass 2: vercel preset — produces the deployable .vercel/output/ (functions + assets).
NITRO_PRESET=vercel pnpm build

# Merge prerendered HTML + sitemap into .vercel/output/static/.
# Vercel's filesystem route handler (see .vercel/output/config.json) serves
# these before invoking /__server, so prerendered routes are CDN-static.
( cd "$prerender_tmp" && find . \( -name '*.html' -o -name 'sitemap.xml' \) -print0 ) \
  | while IFS= read -r -d '' rel; do
      dest=".vercel/output/static/${rel#./}"
      mkdir -p "$(dirname "$dest")"
      cp "$prerender_tmp/${rel#./}" "$dest"
    done

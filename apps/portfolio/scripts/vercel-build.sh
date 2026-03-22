#!/usr/bin/env bash
set -euo pipefail

sitemap_tmp="$(mktemp -t portfolio-sitemap.XXXXXX.xml)"

cleanup() {
  rm -f "$sitemap_tmp"
}

trap cleanup EXIT

pnpm exec auth migrate --yes
pnpm db:migrate

if [ "${ENABLE_AOT:-}" = "1" ]; then
  pnpm --filter @i2-labs/compiler build
  pnpm aot:compile
fi

NITRO_PRESET=node-server pnpm build
cp ".vercel/output/static/sitemap.xml" "$sitemap_tmp"

NITRO_PRESET=vercel pnpm build
cp "$sitemap_tmp" ".vercel/output/static/sitemap.xml"

#!/usr/bin/env node

/**
 * Compares build output sizes between the latest production deployment (main)
 * and the latest preview deployment on deploy/portfolio-aot.
 *
 * Usage: node scripts/compare-build-sizes.mjs [--branch <branch>] [--all]
 *
 * Options:
 *   --branch <branch>   Preview branch to compare (default: deploy/portfolio-aot)
 *   --all               Show all files, not just those with differences
 *
 * Requires the Vercel CLI to be installed and authenticated.
 */

import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const PREVIEW_BRANCH = args.includes("--branch")
  ? args[args.indexOf("--branch") + 1]
  : "deploy/portfolio-aot";
const SHOW_ALL = args.includes("--all");

function exec(cmd) {
  return execSync(cmd, { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
}

function getLatestProduction() {
  const output = exec("vercel ls 2>&1");
  for (const line of output.split("\n")) {
    if (!line.includes("● Ready") || !line.includes("Production")) continue;
    const match = line.match(/https:\/\/\S+\.vercel\.app/);
    if (match) return match[0];
  }
  return null;
}

function findPreviewForBranch(branch) {
  const output = exec("vercel ls 2>&1");
  const branchSlug = branch.replace(/\//g, "-");
  const slugPrefix = branchSlug.slice(0, 10);

  for (const line of output.split("\n")) {
    if (!line.includes("● Ready") || !line.includes("Preview")) continue;
    const match = line.match(/https:\/\/\S+\.vercel\.app/);
    if (!match) continue;

    const inspectOutput = exec(`vercel inspect ${match[0]} 2>&1`);
    if (
      inspectOutput.includes(branchSlug) ||
      inspectOutput.includes(branch) ||
      inspectOutput.includes(`git-${slugPrefix}`)
    ) {
      return match[0];
    }
  }
  return null;
}

function parseAssets(log) {
  const assets = new Map();

  for (const line of log.split("\n")) {
    const match = line.match(
      /\.vercel\/output\/(static\/assets|server|functions\/__server\.func)\/([\S]+)\s+([\d,]+\.?\d*)\s*kB/,
    );
    if (!match) continue;

    const category = match[1];
    const filePath = match[2];
    const size = parseFloat(match[3].replace(/,/g, ""));

    let type;
    if (category === "static/assets") type = "client";
    else if (category.includes("functions")) type = "function";
    else type = "server";

    // Use directory + base name (without hash) as the match key.
    // Keep directory to disambiguate files like _ssr/route vs _chunks/route.
    const dir = filePath.includes("/") ? filePath.replace(/\/[^/]+$/, "/") : "";
    const fileName = filePath.replace(/.*\//, "");
    const baseName = fileName.replace(/-[A-Za-z0-9_]{6,12}\./, ".");
    const key = `${type}:${dir}${baseName}`;

    const gzipMatch = line.match(/gzip:\s+([\d,]+\.?\d*)\s*kB/);
    const gzip = gzipMatch ? parseFloat(gzipMatch[1].replace(/,/g, "")) : null;

    // If duplicate key, keep the last (most specific) occurrence
    assets.set(key, { key, baseName: `${dir}${baseName}`, size, gzip, type });
  }

  return assets;
}

function formatSize(kb) {
  if (kb >= 1000) return `${(kb / 1000).toFixed(2)} MB`;
  return `${kb.toFixed(2)} kB`;
}

function formatDelta(prodSize, previewSize) {
  const diff = previewSize - prodSize;
  const pct = prodSize > 0 ? ((diff / prodSize) * 100).toFixed(1) : "∞";
  const sign = diff > 0 ? "+" : "";
  if (Math.abs(diff) < 0.01) return "same";
  return `${sign}${formatSize(diff)} (${sign}${pct}%)`;
}

function printSection(label, prodMap, previewMap, type) {
  const allKeys = new Set([...prodMap.keys(), ...previewMap.keys()].filter((k) => k.startsWith(`${type}:`)));

  if (allKeys.size === 0) return;

  const rows = [];
  let totalProd = 0;
  let totalPreview = 0;

  for (const key of allKeys) {
    const prod = prodMap.get(key);
    const prev = previewMap.get(key);
    const prodSize = prod?.size ?? 0;
    const prevSize = prev?.size ?? 0;
    totalProd += prodSize;
    totalPreview += prevSize;

    const diff = prevSize - prodSize;
    const hasDiff = Math.abs(diff) >= 0.01;
    const name = (prod ?? prev).baseName;

    if (!SHOW_ALL && !hasDiff && prod && prev) continue;

    rows.push({ name, prodSize, prevSize, diff, isNew: !prod, isRemoved: !prev });
  }

  if (rows.length === 0 && !SHOW_ALL) {
    console.log(`\n  ${label}: no differences\n`);
    return;
  }

  // Sort: biggest absolute diff first
  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log(`\n${"─".repeat(90)}`);
  console.log(`  ${label}`);
  console.log(`${"─".repeat(90)}`);
  console.log(
    `  ${"File".padEnd(40)} ${"Prod".padStart(10)} ${"Preview".padStart(10)}   Delta`,
  );
  console.log(`  ${"─".repeat(87)}`);

  for (const row of rows) {
    const prodCol = row.isNew ? "—".padStart(10) : formatSize(row.prodSize).padStart(10);
    const prevCol = row.isRemoved ? "removed".padStart(10) : formatSize(row.prevSize).padStart(10);
    const deltaCol = row.isNew
      ? "new"
      : row.isRemoved
        ? "removed"
        : formatDelta(row.prodSize, row.prevSize);

    console.log(`  ${row.name.padEnd(40)} ${prodCol} ${prevCol}   ${deltaCol}`);
  }

  console.log(`  ${"─".repeat(87)}`);
  const totalDelta = formatDelta(totalProd, totalPreview);
  console.log(
    `  ${"Total".padEnd(40)} ${formatSize(totalProd).padStart(10)} ${formatSize(totalPreview).padStart(10)}   ${totalDelta}`,
  );
}

// ── Main ──

console.log("Fetching deployments...");
const production = getLatestProduction();
const preview = findPreviewForBranch(PREVIEW_BRANCH);

if (!production) {
  console.error("Could not find latest production deployment");
  process.exit(1);
}
if (!preview) {
  console.error(`Could not find preview deployment for branch: ${PREVIEW_BRANCH}`);
  process.exit(1);
}

console.log(`Production: ${production}`);
console.log(`Preview:    ${preview} (${PREVIEW_BRANCH})`);
console.log("\nFetching build logs...");

const prodLog = exec(`vercel inspect ${production} --logs 2>&1`);
const previewLog = exec(`vercel inspect ${preview} --logs 2>&1`);

const prodAssets = parseAssets(prodLog);
const previewAssets = parseAssets(previewLog);

printSection("Client Assets (static/assets)", prodAssets, previewAssets, "client");
printSection("Server Chunks", prodAssets, previewAssets, "server");
printSection("Server Function", prodAssets, previewAssets, "function");
console.log();

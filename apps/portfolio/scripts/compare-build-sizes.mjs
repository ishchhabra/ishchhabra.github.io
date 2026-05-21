#!/usr/bin/env node

/**
 * Compare Vercel build artifact sizes between production and a preview branch.
 *
 * Usage: node scripts/compare-build-sizes.mjs [--branch <branch>] [--project <name>] [--all]
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BRANCH = "deploy/portfolio-aot";
const DEFAULT_PROJECT = "ishchhabra-portfolio";
const COLUMN_WIDTH = 48;

function parseArgs(argv) {
  const options = {
    branch: DEFAULT_BRANCH,
    project: process.env.VERCEL_PROJECT ?? null,
    showAll: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--all") {
      options.showAll = true;
      continue;
    }
    if (arg === "--branch" || arg === "--project") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === "--branch") options.branch = value;
      else options.project = value;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      process.exit(0);
    }
    throw new Error(`Unknown option: ${arg}`);
  }

  return options;
}

function printUsage() {
  console.log(`
Usage: pnpm compare-build-sizes [--branch <branch>] [--project <name>] [--all]

Options:
  --branch <branch>   Preview branch to compare (default: ${DEFAULT_BRANCH})
  --project <name>    Vercel project name (default: linked project or ${DEFAULT_PROJECT})
  --all               Show unchanged files too
`);
}

function runVercel(args, options = {}) {
  const result = spawnSync("vercel", [...args, "--no-color", "--non-interactive"], {
    encoding: "utf-8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      [`vercel ${args.join(" ")} failed`, result.stderr.trim(), result.stdout.trim()]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return options.includeStderr ? `${result.stdout}${result.stderr}` : result.stdout;
}

function readLinkedProjectName() {
  const projectJson = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    ".vercel",
    "project.json",
  );

  try {
    const project = JSON.parse(readFileSync(projectJson, "utf-8"));
    return typeof project.projectName === "string" ? project.projectName : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function parseJson(output, command) {
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(`Vercel returned invalid JSON for ${command}: ${error.message}`);
  }
}

function listDeployments(projectName, args = []) {
  const output = runVercel(["ls", projectName, "--format", "json", "--status", "READY", ...args]);
  const parsed = parseJson(output, `vercel ls ${projectName}`);
  if (!Array.isArray(parsed.deployments)) {
    throw new Error(`Vercel response for ${projectName} did not include a deployments array`);
  }
  return parsed.deployments;
}

function resolveProjectName(requestedProject) {
  const candidates = [
    requestedProject,
    requestedProject ? null : readLinkedProjectName(),
    requestedProject ? null : DEFAULT_PROJECT,
  ].filter(Boolean);

  for (const projectName of new Set(candidates)) {
    const deployments = listDeployments(projectName);
    if (deployments.length > 0) return projectName;
  }

  throw new Error(`No ready deployments found for project candidates: ${candidates.join(", ")}`);
}

function latestDeployment(deployments) {
  return deployments.toSorted((a, b) => deploymentTime(b) - deploymentTime(a))[0] ?? null;
}

function deploymentTime(deployment) {
  return deployment.ready ?? deployment.createdAt ?? 0;
}

function deploymentUrl(deployment) {
  if (!deployment?.url) return null;
  return deployment.url.startsWith("http") ? deployment.url : `https://${deployment.url}`;
}

function findProduction(projectName) {
  const deployments = listDeployments(projectName, ["--environment", "production"]);
  return latestDeployment(deployments);
}

function findPreview(projectName, branch) {
  const deployments = listDeployments(projectName, [
    "--environment",
    "preview",
    "--meta",
    `githubCommitRef=${branch}`,
  ]);
  return latestDeployment(deployments);
}

function inspectLogs(deployment) {
  const url = deploymentUrl(deployment);
  if (!url) throw new Error("Deployment is missing a URL");
  return runVercel(["inspect", url, "--logs"], { includeStderr: true });
}

function parseAssets(log) {
  const assets = new Map();
  const artifactPattern =
    /\.vercel\/output\/(static\/assets|server|functions\/__server\.func)\/(\S+)\s+([\d,]+\.?\d*)\s*kB/;

  for (const line of log.split("\n")) {
    const match = line.match(artifactPattern);
    if (!match) continue;

    const [, category, filePath, rawSize] = match;
    const type = artifactType(category);
    const name = normalizeArtifactName(filePath);
    const key = `${type}:${name}`;
    const gzipMatch = line.match(/gzip:\s+([\d,]+\.?\d*)\s*kB/);

    assets.set(key, {
      key,
      name,
      size: parseNumber(rawSize),
      gzip: gzipMatch ? parseNumber(gzipMatch[1]) : null,
      type,
    });
  }

  return assets;
}

function artifactType(category) {
  if (category === "static/assets") return "client";
  if (category === "server") return "server";
  return "function";
}

function parseNumber(value) {
  return Number.parseFloat(value.replaceAll(",", ""));
}

function normalizeArtifactName(filePath) {
  const directory = filePath.includes("/") ? filePath.replace(/\/[^/]+$/, "/") : "";
  const fileName = filePath.replace(/^.*\//, "");
  const normalizedFileName = fileName
    .replace(/-\.(\w+)$/, ".$1")
    .replace(/-{1,2}([A-Za-z0-9_]*[A-Z0-9][A-Za-z0-9_-]*)\.(\w+)$/, ".$2");
  return `${directory}${normalizedFileName}`;
}

function formatSize(kb) {
  if (kb >= 1000) return `${(kb / 1000).toFixed(2)} MB`;
  return `${kb.toFixed(2)} kB`;
}

function formatDelta(prodSize, previewSize) {
  const diff = previewSize - prodSize;
  if (Math.abs(diff) < 0.01) return "same";

  const pct = prodSize > 0 ? `${((diff / prodSize) * 100).toFixed(1)}%` : "new";
  const sign = diff > 0 ? "+" : "";
  return `${sign}${formatSize(diff)} (${sign}${pct})`;
}

function compareAssets(prodMap, previewMap, type, showAll) {
  const keys = new Set(
    [...prodMap.keys(), ...previewMap.keys()].filter((key) => key.startsWith(`${type}:`)),
  );
  let totalProd = 0;
  let totalPreview = 0;
  const rows = [];

  for (const key of keys) {
    const prod = prodMap.get(key);
    const preview = previewMap.get(key);
    const prodSize = prod?.size ?? 0;
    const previewSize = preview?.size ?? 0;
    const diff = previewSize - prodSize;

    totalProd += prodSize;
    totalPreview += previewSize;

    if (!showAll && Math.abs(diff) < 0.01 && prod && preview) continue;

    rows.push({
      name: (prod ?? preview).name,
      prodSize,
      previewSize,
      diff,
      status: prod ? (preview ? "changed" : "removed") : "new",
    });
  }

  rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.name.localeCompare(b.name));

  return { rows, totalProd, totalPreview };
}

function printSection(label, prodMap, previewMap, type, showAll) {
  const comparison = compareAssets(prodMap, previewMap, type, showAll);
  if (comparison.rows.length === 0 && comparison.totalProd === 0 && comparison.totalPreview === 0) {
    return;
  }

  console.log(`\n${"─".repeat(96)}`);
  console.log(`  ${label}`);
  console.log(`${"─".repeat(96)}`);

  if (comparison.rows.length === 0) {
    console.log("  no differences");
  } else {
    console.log(
      `  ${"File".padEnd(COLUMN_WIDTH)} ${"Prod".padStart(10)} ${"Preview".padStart(10)}   Delta`,
    );
    console.log(`  ${"─".repeat(93)}`);

    for (const row of comparison.rows) {
      console.log(formatRow(row));
    }
  }

  console.log(`  ${"─".repeat(93)}`);
  console.log(
    `  ${"Total".padEnd(COLUMN_WIDTH)} ${formatSize(comparison.totalProd).padStart(10)} ${formatSize(comparison.totalPreview).padStart(10)}   ${formatDelta(comparison.totalProd, comparison.totalPreview)}`,
  );
}

function formatRow(row) {
  const prod = row.status === "new" ? "—" : formatSize(row.prodSize);
  const preview = row.status === "removed" ? "removed" : formatSize(row.previewSize);
  const delta =
    row.status === "new"
      ? "new"
      : row.status === "removed"
        ? "removed"
        : formatDelta(row.prodSize, row.previewSize);

  return `  ${truncate(row.name, COLUMN_WIDTH).padEnd(COLUMN_WIDTH)} ${prod.padStart(10)} ${preview.padStart(10)}   ${delta}`;
}

function truncate(value, width) {
  if (value.length <= width) return value;
  return `…${value.slice(-(width - 1))}`;
}

function printDeployment(label, deployment) {
  const commit = deployment.meta?.githubCommitSha?.slice(0, 7) ?? "unknown";
  const ref = deployment.meta?.githubCommitRef ?? "unknown";
  console.log(`${label}: ${deploymentUrl(deployment)} (${ref}@${commit})`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const projectName = resolveProjectName(options.project);

  console.log(`Fetching deployments for ${projectName}...`);
  const production = findProduction(projectName);
  const preview = findPreview(projectName, options.branch);

  if (!production)
    throw new Error(`Could not find a ready production deployment for ${projectName}`);
  if (!preview) {
    throw new Error(
      `Could not find a ready preview deployment for ${options.branch} in ${projectName}`,
    );
  }

  printDeployment("Production", production);
  printDeployment("Preview", preview);
  console.log("\nFetching build logs...");

  const prodAssets = parseAssets(inspectLogs(production));
  const previewAssets = parseAssets(inspectLogs(preview));

  printSection("Client Assets", prodAssets, previewAssets, "client", options.showAll);
  printSection("Server Chunks", prodAssets, previewAssets, "server", options.showAll);
  printSection("Server Function Contents", prodAssets, previewAssets, "function", options.showAll);
  console.log();
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

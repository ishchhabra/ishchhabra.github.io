import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { readBaseline } from "./baseline.mjs";
import { ensureTest262Checkout, run } from "./checkout.mjs";
import { packageRoot } from "./paths.mjs";

const baseline = readBaseline();

ensureTest262Checkout(baseline.test262Revision);

if (process.env.TEST262_SKIP_BUILD !== "1") {
  run("pnpm", ["exec", "tsc", "-p", "tsconfig.json", "--emitDeclarationOnly"], {
    cwd: packageRoot,
  });
  run("pnpm", ["exec", "rolldown", "-c"], { cwd: packageRoot });
}

const vitestArgs = [
  "exec",
  "vitest",
  "run",
  "--config",
  resolve(packageRoot, "scripts/test262/vitest.config.mjs"),
  "--testTimeout",
  process.env.TEST262_TIMEOUT ?? "30000",
];

if (process.env.TEST262_REPORTER !== undefined) {
  vitestArgs.push("--reporter", process.env.TEST262_REPORTER);
}

if (process.env.TEST262_OUTPUT_FILE !== undefined) {
  vitestArgs.push("--outputFile", process.env.TEST262_OUTPUT_FILE);
}

const result = spawnSync("pnpm", vitestArgs, {
  cwd: packageRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    NODE_OPTIONS: nodeOptions(["--experimental-vm-modules"]),
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);

function nodeOptions(options) {
  const existing = process.env.NODE_OPTIONS?.trim();
  const values = existing === undefined || existing === "" ? [] : existing.split(/\s+/);
  return [...new Set([...values, ...options])].join(" ");
}

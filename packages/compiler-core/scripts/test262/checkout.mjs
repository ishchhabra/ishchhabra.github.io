import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { repoRoot, test262Dir } from "./paths.mjs";

export function ensureTest262Checkout(test262Revision) {
  if (!existsSync(test262Dir)) {
    mkdirSync(dirname(test262Dir), { recursive: true });
    run("git", ["clone", "https://github.com/tc39/test262.git", test262Dir], { cwd: repoRoot });
  }

  const currentRevision = capture("git", ["rev-parse", "HEAD"], { cwd: test262Dir });
  if (currentRevision === test262Revision) return;

  run("git", ["fetch", "--depth=1", "origin", test262Revision], { cwd: test262Dir });
  run("git", ["-c", "advice.detachedHead=false", "checkout", "FETCH_HEAD"], { cwd: test262Dir });
}

function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stderr}`);
  }

  return result.stdout.trim();
}

export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed`);
  }
}

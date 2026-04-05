// Workaround for pnpm-sync EEXIST bug: clean target dist folders before syncing.
// See: https://github.com/tiktok/pnpm-sync
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const sync = JSON.parse(readFileSync("node_modules/.pnpm-sync.json", "utf8"));
for (const target of sync.postbuildInjectedCopy.targetFolders) {
  const dist = resolve("node_modules", target.folderPath, "dist");
  rmSync(dist, { recursive: true, force: true });
}

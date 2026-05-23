import { resolve } from "node:path";

export const packageRoot = resolve(import.meta.dirname, "../..");
export const repoRoot = resolve(packageRoot, "../..");
export const baselinePath = resolve(packageRoot, "test262-baseline.json");
export const test262Dir = resolve(repoRoot, ".cache/test262");
export const test262HarnessDir = resolve(test262Dir, "harness");

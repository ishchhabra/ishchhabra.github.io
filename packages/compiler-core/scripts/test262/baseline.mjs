import { readFileSync } from "node:fs";

import { baselinePath } from "./paths.mjs";

export function readBaseline() {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (typeof baseline.test262Revision !== "string" || baseline.test262Revision.length === 0) {
    throw new Error("test262-baseline.json must contain a test262Revision string");
  }
  if (!Array.isArray(baseline.expectedFailures)) {
    throw new Error("test262-baseline.json must contain an expectedFailures array");
  }
  return baseline;
}

export function expectedFailureIds(baseline) {
  const ids = new Set(baseline.expectedFailures);
  if (ids.size !== baseline.expectedFailures.length) {
    throw new Error("test262-baseline.json must not contain duplicate expectedFailures");
  }
  return ids;
}

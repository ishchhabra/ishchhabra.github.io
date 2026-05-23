import { describe, test } from "vitest";

import { expectedFailureIds, readBaseline } from "./baseline.mjs";
import { discoverTestFiles, scenarioDescriptorsForFile } from "./discover.mjs";
import { runScenario } from "./execute.mjs";

const baseline = readBaseline();
const expectedFailures = expectedFailureIds(baseline);
const baselineMode = baselineModeEnv();
const shardIndex = integerEnv("TEST262_SHARD_INDEX", 0);
const shardTotal = integerEnv("TEST262_SHARD_TOTAL", 1);

if (shardTotal === 0) {
  throw new Error("TEST262_SHARD_TOTAL must be greater than zero");
}

if (shardIndex >= shardTotal) {
  throw new Error("TEST262_SHARD_INDEX must be less than TEST262_SHARD_TOTAL");
}

const files = discoverTestFiles({
  shardIndex,
  shardTotal,
});

describe(`Test262 ${shardIndex + 1}/${shardTotal}`, () => {
  for (const file of files) {
    test(file, async () => {
      const failures = [];

      for (const scenario of scenarioDescriptorsForFile(file)) {
        const result = await runScenario(scenario);
        const expectedFailure = baselineMode === "enforce" && expectedFailures.has(scenario.id);

        if (expectedFailure) {
          if (result.status === "pass") {
            failures.push(`${scenario.id}: expected failure passed`);
          }
          continue;
        }

        if (result.status !== "pass") {
          failures.push(formatFailure(scenario.id, result));
        }
      }

      if (failures.length > 0) {
        throw new Error(failures.join("\n\n"));
      }
    });
  }
});

function formatFailure(id, result) {
  const details = [`${id}: ${result.phase ?? "unknown"} failure: ${result.message}`];
  if (result.stack) details.push(result.stack);
  return details.join("\n");
}

function baselineModeEnv() {
  const value = process.env.TEST262_BASELINE_MODE ?? "enforce";
  if (value !== "enforce" && value !== "ignore") {
    throw new Error("TEST262_BASELINE_MODE must be either enforce or ignore");
  }
  return value;
}

function integerEnv(name, fallback) {
  const value = process.env[name];
  if (value === undefined) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }

  return parsed;
}

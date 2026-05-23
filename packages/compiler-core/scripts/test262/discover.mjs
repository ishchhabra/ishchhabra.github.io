import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { parse } from "yaml";

import { test262Dir } from "./paths.mjs";

const testPatterns = [
  // Main conformance areas. Staging and harness self-tests are intentionally excluded.
  "test/annexB/**/*.js",
  "test/built-ins/**/*.js",
  "test/intl402/**/*.js",
  "test/language/**/*.js",
];

export function discoverTestFiles(options) {
  const files = discoverFiles();
  return shard(files, options.shardIndex, options.shardTotal);
}

function discoverFiles() {
  const files = walk(resolve(test262Dir, "test"))
    .filter((file) => file.endsWith(".js"))
    .map((file) => normalizePath(relative(test262Dir, file)))
    .sort();
  const regexes = testPatterns.map(globToRegExp);
  return files.filter((file) => regexes.some((regex) => regex.test(file)));
}

export function expandScenarioDescriptor(descriptor, source) {
  const { metadata, body } = parseTestFile(source);

  return {
    ...descriptor,
    body,
    includes: metadata.includes,
    flags: metadata.flags,
    negative: metadata.negative,
  };
}

export function scenarioDescriptorsForFile(relativeFile) {
  const path = resolve(test262Dir, relativeFile);
  const source = readFileSync(path, "utf8");
  const { metadata } = parseTestFile(source);
  const variants = variantsForFlags(new Set(metadata.flags));
  return variants.map((variant) => scenarioDescriptor(relativeFile, variant));
}

function variantsForFlags(flags) {
  if (flags.has("raw")) return ["default"];
  if (flags.has("module")) return ["module"];
  if (flags.has("onlyStrict")) return ["strict"];
  if (flags.has("noStrict")) return ["default"];
  return ["default", "strict"];
}

function scenarioDescriptor(file, variant) {
  return {
    id: `${file}#${variant}`,
    file,
    variant,
  };
}

function parseTestFile(source) {
  const match = source.match(/\/\*---\s*([\s\S]*?)\s*---\*\//);
  if (match === null) {
    return { metadata: emptyMetadata(), body: source };
  }

  return {
    metadata: parseMetadata(match[1].replace(/\r\n?/g, "\n")),
    body: `${source.slice(0, match.index)}${source.slice(match.index + match[0].length)}`,
  };
}

function parseMetadata(source) {
  const parsed = parse(source) ?? {};
  return {
    includes: arrayValue(parsed.includes),
    flags: arrayValue(parsed.flags),
    negative: parsed.negative ?? null,
  };
}

function emptyMetadata() {
  return {
    includes: [],
    flags: [],
    negative: null,
  };
}

function arrayValue(value) {
  return Array.isArray(value) ? value.map(String) : [];
}

function shard(files, shardIndex, shardTotal) {
  if (shardTotal === 1) return files;
  return files.filter((_, index) => index % shardTotal === shardIndex);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function globToRegExp(pattern) {
  const escaped = normalizePath(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const source = escaped.replace(/\*\*/g, "\0").replace(/\*/g, "[^/]*").replace(/\0/g, ".*");
  return new RegExp(`^${source}$`);
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

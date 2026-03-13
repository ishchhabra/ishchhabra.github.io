// testFixtures.ts

import { execFileSync } from "child_process";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { merge } from "lodash-es";
import { tmpdir } from "os";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { compile, CompilerOptions, CompilerOptionsSchema } from "../src/compile";

interface Fixture {
  input: string;
  output: string;
}

interface TreeNode {
  __fixtures?: Fixture[];
  [key: string]: TreeNode | Fixture[] | undefined;
}

function safeReadJson(filePath: string): Partial<CompilerOptions> | undefined {
  if (!existsSync(filePath)) return undefined;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function loadOptionsChain(
  rootDir: string,
  testDir: string,
  baseOptions: CompilerOptions,
): CompilerOptions {
  const dirs: string[] = [];
  let current = testDir;

  while (true) {
    dirs.push(current);
    if (current === rootDir) break;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  dirs.reverse();
  let merged = { ...baseOptions };

  for (const dir of dirs) {
    const localOpts = safeReadJson(join(dir, "options.json"));
    if (localOpts && typeof localOpts === "object") {
      merged = merge({}, merged, localOpts);
    }
  }
  return merged;
}

function findFixtures(dir: string): Fixture[] {
  const fixtures: Fixture[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const subdir = join(dir, entry.name);
      fixtures.push(...findFixtures(subdir));
    } else if (entry.name === "code.js") {
      fixtures.push({ input: join(dir, entry.name), output: join(dir, "output.js") });
    } else if (entry.name === "code.jsx") {
      fixtures.push({ input: join(dir, entry.name), output: join(dir, "output.jsx") });
    }
  }
  return fixtures;
}

function buildTreeFromFixtures(dir: string, fixtures: Fixture[]): TreeNode {
  const root: TreeNode = {};
  for (const { input, output } of fixtures) {
    const relPath = relative(dir, input);
    const parts = relPath.split("/");
    parts.pop();

    let currentNode: TreeNode = root;
    for (const part of parts) {
      if (!currentNode[part]) {
        currentNode[part] = {};
      }
      currentNode = currentNode[part] as TreeNode;
    }

    if (!currentNode.__fixtures) {
      currentNode.__fixtures = [];
    }
    currentNode.__fixtures.push({ input, output });
  }
  return root;
}

function getFolderName(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 2] || "unknown";
}

const oxfmtBin = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "node_modules",
  ".bin",
  "oxfmt",
);

/**
 * Pre-compiled and formatted results, keyed by fixture input path.
 * Populated in beforeAll, consumed by individual tests.
 */
const formattedResults = new Map<string, string>();
let tmpDir: string | undefined;

function compileAndBatchFormat(
  allFixtures: Fixture[],
  rootDir: string,
  baseOptions: CompilerOptions,
) {
  tmpDir = mkdtempSync(join(tmpdir(), "compiler-test-"));

  // Phase 1: Compile all fixtures and write raw output to temp files.
  for (const { input } of allFixtures) {
    const options = loadOptionsChain(rootDir, dirname(input), baseOptions);
    const compiled = compile(input, options);
    const tmpFile = join(tmpDir, encodeURIComponent(input) + ".js");
    writeFileSync(tmpFile, compiled);
  }

  // Phase 2: Single oxfmt call formats all files at once.
  execFileSync(oxfmtBin, ["--write", tmpDir]);

  // Phase 3: Read back formatted results.
  for (const { input } of allFixtures) {
    const tmpFile = join(tmpDir, encodeURIComponent(input) + ".js");
    formattedResults.set(input, readFileSync(tmpFile, "utf-8").trim());
  }
}

function addTestSuites(
  tree: TreeNode,
  baseOptions: CompilerOptions,
  nodeName?: string,
  rootDir?: string,
  currentDir?: string,
) {
  const subDirs = Object.keys(tree).filter((k) => k !== "__fixtures");
  const fixtures = tree.__fixtures ?? [];

  const addFixtureTest = ({ input, output }: Fixture, name: string) => {
    test(name, () => {
      const formattedActual = formattedResults.get(input);
      if (formattedActual === undefined) {
        throw new Error(`No compiled result for ${input}`);
      }

      if (!existsSync(output) && process.env.UPDATE_FIXTURES) {
        writeFileSync(output, formattedActual + "\n", "utf8");
        console.info(`[INFO] Created missing fixture file at: ${output}`);
      }

      const expectedCode = readFileSync(output, "utf-8").trim();
      expect(formattedActual).toBe(expectedCode);
    });
  };

  if (subDirs.length === 0 && fixtures.length === 1) {
    addFixtureTest(fixtures[0], nodeName ?? getFolderName(fixtures[0].input));
    return;
  }

  if (nodeName) {
    describe(nodeName, () => {
      for (const fixture of fixtures) {
        addFixtureTest(fixture, getFolderName(fixture.input));
      }
      for (const subDir of subDirs) {
        const nextDir = join(currentDir ?? "", subDir);
        addTestSuites(tree[subDir] as TreeNode, baseOptions, subDir, rootDir, nextDir);
      }
    });
  } else {
    for (const fixture of fixtures) {
      addFixtureTest(fixture, getFolderName(fixture.input));
    }
    for (const subDir of subDirs) {
      const nextDir = join(currentDir ?? "", subDir);
      addTestSuites(tree[subDir] as TreeNode, baseOptions, subDir, rootDir, nextDir);
    }
  }
}

/**
 * Call this in your test file with a directory:
 *   testFixtures(__dirname, { enableConstantPropagationPass: true });
 *
 * It will:
 *   1) Find all fixtures under the directory (look for `code.js` or `code.jsx`)
 *   2) Build a nested tree structure
 *   3) In beforeAll: compile all fixtures and batch-format with a single oxfmt call
 *   4) Dynamically add describe/test blocks that compare pre-formatted results
 *   5) If `output.js`/`output.jsx` is missing and `UPDATE_FIXTURES` is set,
 *      create it using the compiled code's actual output.
 */
export function testFixtures(
  directory: string,
  baseOptions: CompilerOptions = CompilerOptionsSchema.parse({}),
) {
  const allFixtures = findFixtures(directory);
  const tree = buildTreeFromFixtures(directory, allFixtures);

  beforeAll(() => {
    compileAndBatchFormat(allFixtures, directory, baseOptions);
  });

  afterAll(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  addTestSuites(tree, baseOptions, undefined, directory, directory);
}

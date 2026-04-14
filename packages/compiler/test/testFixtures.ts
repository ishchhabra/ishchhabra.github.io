// testFixtures.ts

import { execFileSync } from "child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { merge } from "lodash-es";
import { tmpdir } from "os";
import { dirname, join, relative, resolve } from "path";
import { fileURLToPath } from "url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { compile, CompilerOptions, CompilerOptionsSchema } from "../src/compile";

type FixtureExpectation =
  | {
      kind: "output";
      path: string;
    }
  | {
      kind: "error";
      path: string;
    };

interface Fixture {
  input: string;
  expectation: FixtureExpectation;
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

async function loadOptions(dir: string): Promise<Partial<CompilerOptions> | undefined> {
  const jsPath = join(dir, "options.js");
  if (existsSync(jsPath)) {
    const mod = await import(jsPath);
    return mod.default ?? mod;
  }
  return safeReadJson(join(dir, "options.json"));
}

async function loadOptionsChain(
  rootDir: string,
  testDir: string,
  baseOptions: CompilerOptions,
): Promise<CompilerOptions> {
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
    const localOpts = await loadOptions(dir);
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
      fixtures.push({
        input: join(dir, entry.name),
        expectation: resolveFixtureExpectation(dir, "output.js"),
      });
    } else if (entry.name === "code.jsx") {
      fixtures.push({
        input: join(dir, entry.name),
        expectation: resolveFixtureExpectation(dir, "output.jsx"),
      });
    }
  }
  return fixtures;
}

function resolveFixtureExpectation(dir: string, outputFile: string): FixtureExpectation {
  const outputPath = join(dir, outputFile);
  const errorPath = join(dir, "error.txt");
  const hasOutput = existsSync(outputPath);
  const hasError = existsSync(errorPath);

  if (hasOutput === hasError) {
    throw new Error(
      `Fixture directory must contain exactly one of ${outputFile} or error.txt: ${dir}`,
    );
  }

  if (hasOutput) {
    return { kind: "output", path: outputPath };
  }

  return { kind: "error", path: errorPath };
}

function buildTreeFromFixtures(dir: string, fixtures: Fixture[]): TreeNode {
  const root: TreeNode = {};
  for (const { input, expectation } of fixtures) {
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
    currentNode.__fixtures.push({ input, expectation });
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

async function compileAndBatchFormat(
  allFixtures: Fixture[],
  rootDir: string,
  baseOptions: CompilerOptions,
  formattedResults: Map<string, string>,
  compileErrors: Map<string, string>,
) {
  const tmpDir = mkdtempSync(join(tmpdir(), "compiler-test-"));
  let hasCompiledOutputs = false;

  // Phase 1: Compile all fixtures and write raw output to temp files.
  for (const { input } of allFixtures) {
    try {
      const options = await loadOptionsChain(rootDir, dirname(input), baseOptions);
      const compiled = compile(input, options);
      const tmpFile = join(tmpDir, encodeURIComponent(input) + ".js");
      writeFileSync(tmpFile, compiled);
      hasCompiledOutputs = true;
    } catch (e) {
      compileErrors.set(input, e instanceof Error ? e.message : String(e));
    }
  }

  // Phase 2: Single oxfmt call formats all files at once.
  if (hasCompiledOutputs) {
    execFileSync(oxfmtBin, ["--write", tmpDir]);
  }

  // Phase 3: Read back formatted results (skip fixtures that failed compilation).
  for (const { input } of allFixtures) {
    if (compileErrors.has(input)) continue;
    const tmpFile = join(tmpDir, encodeURIComponent(input) + ".js");
    formattedResults.set(input, readFileSync(tmpFile, "utf-8").trim());
  }

  return tmpDir;
}

function addTestSuites(
  tree: TreeNode,
  baseOptions: CompilerOptions,
  formattedResults: Map<string, string>,
  compileErrors: Map<string, string>,
  nodeName?: string,
  rootDir?: string,
  currentDir?: string,
) {
  const subDirs = Object.keys(tree).filter((k) => k !== "__fixtures");
  const fixtures = tree.__fixtures ?? [];

  const addFixtureTest = ({ input, expectation }: Fixture, name: string) => {
    test(name, () => {
      const error = compileErrors.get(input);
      if (expectation.kind === "error") {
        if (error === undefined) {
          throw new Error(`Expected compilation to fail for ${input}`);
        }

        const expectedError = readFileSync(expectation.path, "utf-8").trim();
        expect(error).toBe(expectedError);
        return;
      }

      if (error !== undefined) {
        throw new Error(`Compilation failed for ${input}: ${error}`);
      }
      const formattedActual = formattedResults.get(input);
      if (formattedActual === undefined) {
        throw new Error(`No compiled result for ${input}`);
      }

      if (!existsSync(expectation.path) && process.env.UPDATE_FIXTURES) {
        writeFileSync(expectation.path, formattedActual + "\n", "utf8");
        console.info(`[INFO] Created missing fixture file at: ${expectation.path}`);
      } else if (process.env.UPDATE_FIXTURES) {
        const existingCode = readFileSync(expectation.path, "utf-8").trim();
        if (existingCode !== formattedActual) {
          writeFileSync(expectation.path, formattedActual + "\n", "utf8");
          console.info(`[INFO] Updated fixture file at: ${expectation.path}`);
        }
      }

      const expectedCode = readFileSync(expectation.path, "utf-8").trim();
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
        addTestSuites(
          tree[subDir] as TreeNode,
          baseOptions,
          formattedResults,
          compileErrors,
          subDir,
          rootDir,
          nextDir,
        );
      }
    });
  } else {
    for (const fixture of fixtures) {
      addFixtureTest(fixture, getFolderName(fixture.input));
    }
    for (const subDir of subDirs) {
      const nextDir = join(currentDir ?? "", subDir);
      addTestSuites(
        tree[subDir] as TreeNode,
        baseOptions,
        formattedResults,
        compileErrors,
        subDir,
        rootDir,
        nextDir,
      );
    }
  }
}

/**
 * Call this in your test file with a directory:
 *   testFixtures(__dirname, { enableDeadCodeEliminationPass: true });
 *
 * It will:
 *   1) Find all fixtures under the directory (look for `code.js` or `code.jsx`)
 *      and require exactly one of `output.js`/`output.jsx` or `error.txt`
 *   2) Build a nested tree structure
 *   3) In beforeAll: compile all fixtures and batch-format with a single oxfmt call
 *   4) Dynamically add describe/test blocks that compare either pre-formatted
 *      output or the expected compile error
 *   5) If `output.js`/`output.jsx` is missing and `UPDATE_FIXTURES` is set,
 *      create it using the compiled code's actual output.
 */
export function testFixtures(
  directory: string,
  baseOptions: CompilerOptions = CompilerOptionsSchema.parse({}),
) {
  const allFixtures = findFixtures(directory);
  const tree = buildTreeFromFixtures(directory, allFixtures);
  const formattedResults = new Map<string, string>();
  const compileErrors = new Map<string, string>();
  let tmpDir: string | undefined;

  beforeAll(async () => {
    tmpDir = await compileAndBatchFormat(
      allFixtures,
      directory,
      baseOptions,
      formattedResults,
      compileErrors,
    );
  });

  afterAll(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  addTestSuites(
    tree,
    baseOptions,
    formattedResults,
    compileErrors,
    undefined,
    directory,
    directory,
  );
}

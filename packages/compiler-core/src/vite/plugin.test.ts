import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Plugin } from "vite";
import { build } from "vite";
import { describe, expect, it } from "vitest";

import { compilerVitePlugin } from "./plugin";

type TransformHook = Extract<NonNullable<Plugin["transform"]>, Function>;
type TransformResult = Awaited<ReturnType<TransformHook>>;

interface TestTransformContext {
  readonly environment: {
    readonly name: string;
    readonly config: {
      readonly consumer: "client" | "server";
    };
  };

  resolve(
    specifier: string,
    importer?: string,
    options?: { readonly skipSelf?: boolean },
  ): Promise<{ readonly id: string } | null>;
}

function transformHook(plugin: Plugin): TransformHook {
  if (typeof plugin.transform !== "function") {
    throw new Error("Expected compiler plugin to expose a transform hook");
  }

  return plugin.transform;
}

function codeFromTransformResult(result: TransformResult): string | null {
  if (result === null || result === undefined) return null;
  if (typeof result === "string") return result;
  if ("code" in result) return result.code;

  return null;
}

describe("compilerVitePlugin", () => {
  it("compiles node_modules modules before feeding them into Vite bundle tree-shaking", async () => {
    const rootDir = path.resolve("tmp/compiler-vite-node-modules");
    const transformedModules = new Map<string, string>();
    await rm(rootDir, { recursive: true, force: true });
    await mkdir(path.join(rootDir, "src"), { recursive: true });
    await mkdir(path.join(rootDir, "node_modules/tiny-math"), { recursive: true });
    await writeFile(
      path.join(rootDir, "index.html"),
      '<script type="module" src="/src/main.js"></script>',
    );
    await writeFile(
      path.join(rootDir, "src/main.js"),
      'import { answer } from "tiny-math";\nconsole.log(answer);\n',
    );
    await writeFile(
      path.join(rootDir, "node_modules/tiny-math/package.json"),
      JSON.stringify({
        name: "tiny-math",
        version: "1.0.0",
        type: "module",
        module: "index.js",
        sideEffects: false,
      }),
    );
    await writeFile(
      path.join(rootDir, "node_modules/tiny-math/index.js"),
      "export const answer = 10 + 32;\nexport const unused = 4 + 5;\n",
    );

    try {
      await build({
        root: rootDir,
        configFile: false,
        logLevel: "silent",
        plugins: [
          compilerVitePlugin({
            rootDir,
            include: ["src"],
          }),
          {
            name: "capture-after-compiler",
            transform(code, id) {
              if (id.includes("/node_modules/tiny-math/")) {
                transformedModules.set(id, code);
              }

              return null;
            },
          },
        ],
        build: {
          emptyOutDir: true,
          minify: false,
          outDir: "dist",
          rollupOptions: {
            output: {
              entryFileNames: "assets/[name].js",
            },
          },
        },
      });

      const transformedDependency = [...transformedModules.values()].join("\n");
      const output = await readBuiltJavaScript(path.join(rootDir, "dist/assets"));
      expect(transformedDependency).toMatch(/const \$d\d+ = 42;/);
      expect(transformedDependency).not.toContain("10 + 32");
      expect(transformedDependency).not.toContain("4 + 5");
      expect(output).toMatch(/const \$d\d+ = 42;\nconsole\.log\(\$d\d+\);/);
      expect(output).not.toContain("10 + 32");
      expect(output).not.toContain("unused");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("returns graph-emitted dependency code from cache before entrypoint gating", async () => {
    const rootDir = path.resolve("tmp/compiler-vite-cache");
    const entryId = path.join(rootDir, "src/main.js");
    const dependencyId = path.join(rootDir, "node_modules/tiny-math/index.js");
    const entrySource = 'import { square } from "tiny-math"; export const result = square(4);';
    const dependencySource = "export function square(value) { return value * value; }";
    await writeModuleFixture(rootDir, entrySource, dependencySource);

    const context: TestTransformContext = {
      environment: {
        name: "client",
        config: { consumer: "client" },
      },

      async resolve(specifier, importer) {
        if (specifier === "tiny-math") {
          return { id: dependencyId };
        }

        if (specifier.startsWith(".")) {
          const base = importer?.slice(0, importer.lastIndexOf("/")) ?? rootDir;
          return { id: `${base}/${specifier.replace(/^\.\//, "")}` };
        }

        return { id: specifier };
      },
    };
    const transform = transformHook(
      compilerVitePlugin({
        rootDir,
        include: ["src"],
      }),
    );

    try {
      await transform.call(
        context as unknown as ThisParameterType<TransformHook>,
        entrySource,
        entryId,
      );
      const dependencyResult = await transform.call(
        context as unknown as ThisParameterType<TransformHook>,
        dependencySource,
        dependencyId,
      );

      expect(codeFromTransformResult(dependencyResult)).toContain("square");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("uses full Vite module ids as cache keys", async () => {
    const rootDir = path.resolve("tmp/compiler-vite-query-cache");
    const entryId = path.join(rootDir, "src/main.js");
    const dependencyFile = path.join(rootDir, "node_modules/tiny-math/index.js");
    const dependencyId = `${dependencyFile}?v=123`;
    const entrySource = 'import { square } from "tiny-math"; export const result = square(4);';
    const dependencySource = "export function square(value) { return value * value; }";
    await writeModuleFixture(rootDir, entrySource, dependencySource);

    const context: TestTransformContext = {
      environment: {
        name: "client",
        config: { consumer: "client" },
      },

      async resolve(specifier) {
        if (specifier === "tiny-math") {
          return { id: dependencyId };
        }

        return { id: specifier };
      },
    };
    const transform = transformHook(
      compilerVitePlugin({
        rootDir,
        include: ["src"],
      }),
    );

    try {
      await transform.call(
        context as unknown as ThisParameterType<TransformHook>,
        entrySource,
        entryId,
      );
      const dependencyResult = await transform.call(
        context as unknown as ThisParameterType<TransformHook>,
        dependencySource,
        dependencyId,
      );

      expect(codeFromTransformResult(dependencyResult)).toContain("square");
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

async function readBuiltJavaScript(dir: string): Promise<string> {
  const files = await readdir(dir);
  const jsFile = files.find((file) => file.endsWith(".js"));
  if (jsFile === undefined) {
    throw new Error(`No JavaScript bundle emitted in ${dir}`);
  }

  return readFile(path.join(dir, jsFile), "utf8");
}

async function writeModuleFixture(
  rootDir: string,
  entrySource: string,
  dependencySource: string,
): Promise<void> {
  await rm(rootDir, { recursive: true, force: true });
  await mkdir(path.join(rootDir, "src"), { recursive: true });
  await mkdir(path.join(rootDir, "node_modules/tiny-math"), { recursive: true });
  await writeFile(path.join(rootDir, "src/main.js"), entrySource);
  await writeFile(path.join(rootDir, "node_modules/tiny-math/index.js"), dependencySource);
}

import type { Plugin } from "vite";
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

  load(options: { readonly id: string }): Promise<{ readonly code: string } | null>;
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
  it("returns graph-emitted dependency code from cache before entrypoint gating", async () => {
    const rootDir = "/project";
    const modules = new Map([
      [
        "/project/src/main.js",
        'import { square } from "tiny-math"; export const result = square(4);',
      ],
      [
        "/project/node_modules/tiny-math/index.js",
        "export function square(value) { return value * value; }",
      ],
    ]);
    const context: TestTransformContext = {
      environment: {
        name: "client",
        config: { consumer: "client" },
      },

      async resolve(specifier, importer) {
        if (specifier === "tiny-math") {
          return { id: "/project/node_modules/tiny-math/index.js" };
        }

        if (specifier.startsWith(".")) {
          const base = importer?.slice(0, importer.lastIndexOf("/")) ?? rootDir;
          return { id: `${base}/${specifier.replace(/^\.\//, "")}` };
        }

        return { id: specifier };
      },

      async load({ id }) {
        const code = modules.get(id);
        return code === undefined ? null : { code };
      },
    };
    const transform = transformHook(
      compilerVitePlugin({
        rootDir,
        include: ["src"],
      }),
    );

    await transform.call(
      context as unknown as ThisParameterType<TransformHook>,
      modules.get("/project/src/main.js")!,
      "/project/src/main.js",
    );
    const dependencyResult = await transform.call(
      context as unknown as ThisParameterType<TransformHook>,
      modules.get("/project/node_modules/tiny-math/index.js")!,
      "/project/node_modules/tiny-math/index.js",
    );

    expect(codeFromTransformResult(dependencyResult)).toContain("square");
  });

  it("uses full Vite module ids as cache keys", async () => {
    const rootDir = "/project";
    const dependencyId = "/project/node_modules/tiny-math/index.js?v=123";
    const modules = new Map([
      [
        "/project/src/main.js",
        'import { square } from "tiny-math"; export const result = square(4);',
      ],
      [dependencyId, "export function square(value) { return value * value; }"],
    ]);
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

      async load({ id }) {
        const code = modules.get(id);
        return code === undefined ? null : { code };
      },
    };
    const transform = transformHook(
      compilerVitePlugin({
        rootDir,
        include: ["src"],
      }),
    );

    await transform.call(
      context as unknown as ThisParameterType<TransformHook>,
      modules.get("/project/src/main.js")!,
      "/project/src/main.js",
    );
    const dependencyResult = await transform.call(
      context as unknown as ThisParameterType<TransformHook>,
      modules.get(dependencyId)!,
      dependencyId,
    );

    expect(codeFromTransformResult(dependencyResult)).toContain("square");
  });
});

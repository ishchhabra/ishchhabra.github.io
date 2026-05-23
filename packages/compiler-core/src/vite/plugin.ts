import path from "node:path";

import { createIdResolver, type Plugin } from "vite";

import type { ModuleEnvironment } from "../compile/ModuleHost";
import { ProgramSession, type EmissionDecision } from "../compile/ProgramSession";
import { createViteModuleHost } from "./createViteModuleHost";

/**
 * Options for using the compiler as a Vite transform plugin.
 */
export interface CompilerVitePluginOptions {
  /**
   * Project root used to produce stable relative filenames to diagnostics.
   *
   * This is the path coordinate system, not the set of files to compile. Use
   * `include` to choose which directories are compiled.
   */
  readonly rootDir: string;

  /**
   * Directories, relative to `rootDir`, whose JavaScript and TypeScript modules
   * should be compiled.
   *
   * @example
   * ```ts
   * compilerVitePlugin({
   *   rootDir: __dirname,
   *   include: ["src"],
   * });
   * ```
   */
  readonly include: readonly string[];
}

const COMPILABLE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx"]);

/**
 * Compiles selected Vite modules before Vite and framework transform hooks run.
 */
export function compilerVitePlugin(options: CompilerVitePluginOptions): Plugin {
  const rootDir = path.resolve(options.rootDir);
  const includeDirs = options.include.map((dir) => path.resolve(rootDir, dir));
  const session = new ProgramSession();
  let resolveId: ReturnType<typeof createIdResolver> | null = null;

  return {
    name: "i2:compiler",
    enforce: "pre",

    configResolved(config) {
      resolveId = createIdResolver(config);
    },

    load(id) {
      const moduleId = moduleIdFromViteId(id);
      if (moduleId === null) return null;

      const environment: ModuleEnvironment = {
        name: this.environment.name,
        consumer: this.environment.config.consumer,
      };

      return adaptEmission(session.emissionFor({ environment, resolvedId: moduleId })) ?? null;
    },

    async transform(source, id) {
      const moduleId = moduleIdFromViteId(id);
      const environment: ModuleEnvironment = {
        name: this.environment.name,
        consumer: this.environment.config.consumer,
      };

      if (moduleId === null) return null;

      const cached = session.emissionFor({ environment, resolvedId: moduleId });
      const cachedResult = adaptEmission(cached);
      if (cachedResult !== undefined) return cachedResult;

      if (!shouldCompileGraphEntrypoint(moduleId, includeDirs)) return null;

      await session.compileGraph({
        environment,
        host: createViteModuleHost(
          {
            resolve: async (specifier, importer, resolveOptions) => {
              if (resolveId !== null) {
                const resolvedId = await resolveId(this.environment, specifier, importer);
                return resolvedId === undefined ? null : { id: resolvedId };
              }

              return this.resolve(specifier, importer, resolveOptions);
            },
          },
          new Map([[moduleId, source]]),
          { environment },
        ),
        entrypoints: [moduleId],
      });

      return adaptEmission(session.emissionFor({ environment, resolvedId: moduleId })) ?? null;
    },

    buildStart() {
      session.invalidate();
    },

    watchChange() {
      session.invalidate();
    },

    handleHotUpdate() {
      session.invalidate();
      return;
    },
  };
}

function adaptEmission(
  emission: EmissionDecision | undefined,
): { readonly code: string; readonly map: null } | null | undefined {
  if (emission === undefined) return undefined;

  switch (emission.kind) {
    case "code":
      return { code: emission.code, map: null };

    case "empty":
      return { code: "export {};\n", map: null };

    case "opaque":
    case "passthrough":
      return null;
  }
}

function shouldCompileGraphEntrypoint(moduleId: string, includeDirs: readonly string[]): boolean {
  const filePath = filePathFromModuleId(moduleId);
  if (filePath === null) return false;
  if (filePath.includes("/node_modules/")) return false;
  return shouldCompile(filePath, includeDirs);
}

function moduleIdFromViteId(id: string): string | null {
  if (id.startsWith("\0")) return null;

  return filePathFromModuleId(id) === null ? null : id;
}

function shouldCompile(filePath: string, includeDirs: readonly string[]): boolean {
  if (filePath.endsWith(".d.ts") || filePath.endsWith(".d.tsx")) return false;
  if (!COMPILABLE_EXTENSIONS.has(path.extname(filePath))) return false;

  return includeDirs.some((dir) => isInside(filePath, dir));
}

function filePathFromModuleId(moduleId: string): string | null {
  const queryIndex = moduleId.indexOf("?");
  const filePath = queryIndex === -1 ? moduleId : moduleId.slice(0, queryIndex);

  return path.isAbsolute(filePath) ? filePath : null;
}

function isInside(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

import path from "node:path";

import type { Plugin } from "vite";

import { compileSource } from "../compile/compileSource";

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
 * Compiles selected Vite modules before framework plugins transform them.
 */
export function compilerVitePlugin(options: CompilerVitePluginOptions): Plugin {
  const rootDir = path.resolve(options.rootDir);
  const includeDirs = options.include.map((dir) => path.resolve(rootDir, dir));

  return {
    name: "i2:compiler",
    enforce: "post",

    transform(source, id) {
      const filePath = normalizeModuleId(id);
      if (filePath === null || !shouldCompile(filePath, includeDirs)) return null;

      const result = compileSource(source, {
        sourceName: path.relative(rootDir, filePath),
        diagnostics: {
          minimumSeverity: "error",
        },
      });

      const error = result.diagnostics.find((diagnostic) => diagnostic.severity === "error");

      if (error !== undefined) {
        this.error({
          message: error.message,
          id: filePath,
        });
      }

      return {
        code: result.code,
        map: null,
      };
    },
  };
}

function normalizeModuleId(id: string): string | null {
  if (id.startsWith("\0")) return null;

  const queryIndex = id.indexOf("?");
  const filePath = queryIndex === -1 ? id : id.slice(0, queryIndex);

  if (!path.isAbsolute(filePath)) return null;
  return filePath;
}

function shouldCompile(filePath: string, includeDirs: readonly string[]): boolean {
  if (filePath.endsWith(".d.ts") || filePath.endsWith(".d.tsx")) return false;
  if (!COMPILABLE_EXTENSIONS.has(path.extname(filePath))) return false;

  return includeDirs.some((dir) => isInside(filePath, dir));
}

function isInside(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

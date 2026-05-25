import path from "node:path";

import { createIdResolver, type Plugin } from "vite";

import { compileSource } from "../compile/compileSource";
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

const COMPILABLE_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs"]);

/**
 * Compiles selected Vite modules after upstream Vite and framework transforms.
 */
export function compilerVitePlugin(options: CompilerVitePluginOptions): Plugin {
  const rootDir = path.resolve(options.rootDir);
  const includeDirs = options.include.map((dir) => path.resolve(rootDir, dir));
  const session = new ProgramSession();
  const program = new ViteCompilerProgram(session);
  let resolveId: ReturnType<typeof createIdResolver> | null = null;

  const plugin: Plugin = {
    name: "i2:compiler",
    enforce: "post",

    configResolved(config) {
      resolveId = createIdResolver(config);
    },

    async transform(source, id) {
      const moduleId = moduleIdFromViteId(id);
      const environment: ModuleEnvironment = {
        name: this.environment.name,
        consumer: this.environment.config.consumer,
      };

      if (moduleId === null) return null;

      program.publishSource(environment, moduleId, source);
      if (program.isTransformingThroughVite(environment, moduleId)) return null;

      const cached = session.emissionFor({ environment, resolvedId: moduleId });
      const cachedResult = adaptEmission(this, moduleId, cached);
      const shouldCompileEntrypoint = shouldCompileGraphEntrypoint(moduleId, includeDirs);

      if (cachedResult !== undefined && !(cachedResult === null && shouldCompileEntrypoint)) {
        return cachedResult;
      }

      if (program.isCompiling(environment, moduleId)) return null;
      if (!shouldCompileEntrypoint) return null;

      if (isNodeModuleId(moduleId)) {
        return transformResult(
          this,
          moduleId,
          compileSource(source, { sourceName: moduleId }).code,
        );
      }

      const mode = modeFromContext(this);
      program.startCompile(environment, moduleId);
      try {
        await session.compileGraph({
          environment,
          host: createViteModuleHost(
            {
              resolve: async (specifier, importer, resolveOptions) => {
                const resolved =
                  resolveId !== null
                    ? await resolveWithViteResolver(
                        resolveId,
                        this.environment,
                        specifier,
                        importer,
                      )
                    : await this.resolve(specifier, importer, resolveOptions);

                if (resolved === null) return null;

                if (shouldExternalizeFromGraph(program, environment, resolved.id, mode)) {
                  return { id: resolved.id, external: true };
                }

                return resolved;
              },
              loadModuleSource: async (resolvedId) => {
                const cachedSource = program.sourceFor(environment, resolvedId);
                if (cachedSource !== undefined) return cachedSource;

                const loaded = await program.loadTransformedModuleThroughVite(
                  this,
                  environment,
                  resolvedId,
                  mode,
                );
                if (loaded !== null) return loaded;

                return undefined;
              },
            },
            {
              entrypoint: { resolvedId: moduleId, source },
              environment,
            },
          ),
          entrypoints: [moduleId],
        });
      } finally {
        program.finishCompile(environment, moduleId);
      }

      return (
        adaptEmission(this, moduleId, session.emissionFor({ environment, resolvedId: moduleId })) ??
        null
      );
    },

    buildStart() {
      program.invalidate();
    },

    watchChange() {
      program.invalidate();
    },

    handleHotUpdate() {
      program.invalidate();
      return;
    },
  };

  return plugin;
}

async function resolveWithViteResolver(
  resolveId: ReturnType<typeof createIdResolver>,
  environment: Parameters<ReturnType<typeof createIdResolver>>[0],
  specifier: string,
  importer: string | undefined,
): Promise<{ readonly id: string; readonly external?: boolean | "absolute" } | null> {
  const resolvedId = await resolveId(environment, specifier, importer);
  return resolvedId === undefined ? null : { id: resolvedId };
}

function shouldExternalizeFromGraph(
  program: ViteCompilerProgram,
  environment: ModuleEnvironment,
  resolvedId: string,
  mode: "build" | "serve",
): boolean {
  if (program.sourceFor(environment, resolvedId) !== undefined) return false;
  if (isNodeModuleId(resolvedId)) return true;

  return mode === "build";
}

async function loadSourceForTransform(
  pluginContainer: VitePluginContainer,
  resolvedId: string,
): Promise<string | null> {
  return codeFromLoadResult(await pluginContainer.load(resolvedId));
}

function codeFromLoadResult(loaded: unknown): string | null {
  if (typeof loaded === "string") return loaded;
  if (
    loaded !== null &&
    typeof loaded === "object" &&
    "code" in loaded &&
    typeof loaded.code === "string"
  ) {
    return loaded.code;
  }

  return null;
}

type TransformHook = Extract<NonNullable<Plugin["transform"]>, Function>;

class ViteCompilerProgram {
  readonly #compiling = new Set<string>();
  readonly #sources = new Map<string, string>();
  readonly #transformingThroughVite = new Set<string>();

  constructor(private readonly session: ProgramSession) {}

  public finishCompile(environment: ModuleEnvironment, resolvedId: string): void {
    this.#compiling.delete(environmentKey(environment, resolvedId));
  }

  public invalidate(): void {
    this.session.invalidate();
    this.#compiling.clear();
    this.#sources.clear();
    this.#transformingThroughVite.clear();
  }

  public isCompiling(environment: ModuleEnvironment, resolvedId: string): boolean {
    return this.#compiling.has(environmentKey(environment, resolvedId));
  }

  public isTransformingThroughVite(environment: ModuleEnvironment, resolvedId: string): boolean {
    return this.#transformingThroughVite.has(environmentKey(environment, resolvedId));
  }

  public async loadTransformedModuleThroughVite(
    context: ThisParameterType<TransformHook>,
    environment: ModuleEnvironment,
    resolvedId: string,
    mode: "build" | "serve",
  ): Promise<string | null> {
    if (mode === "build") return null;

    const pluginContainer = pluginContainerFromEnvironment(context);
    if (pluginContainer === null) return null;

    const loaded = await loadSourceForTransform(pluginContainer, resolvedId);
    if (loaded === null) return null;

    const transformKey = environmentKey(environment, resolvedId);
    this.#transformingThroughVite.add(transformKey);

    try {
      await pluginContainer.moduleGraph?.ensureEntryFromUrl(resolvedId, false);
      const transformed = await pluginContainer.transform(loaded, resolvedId);
      return transformed.code;
    } finally {
      this.#transformingThroughVite.delete(transformKey);
    }
  }

  public publishSource(environment: ModuleEnvironment, resolvedId: string, source: string): void {
    this.#sources.set(environmentKey(environment, resolvedId), source);
  }

  public sourceFor(environment: ModuleEnvironment, resolvedId: string): string | undefined {
    return this.#sources.get(environmentKey(environment, resolvedId));
  }

  public startCompile(environment: ModuleEnvironment, resolvedId: string): void {
    this.#compiling.add(environmentKey(environment, resolvedId));
  }
}

interface VitePluginContainer {
  load(id: string): Promise<unknown>;
  readonly moduleGraph?: {
    ensureEntryFromUrl(rawUrl: string, setIsSelfAccepting?: boolean): Promise<unknown>;
  };
  transform(code: string, id: string): Promise<{ readonly code: string }>;
}

function pluginContainerFromEnvironment(
  context: ThisParameterType<TransformHook>,
): VitePluginContainer | null {
  const environment = context.environment as {
    readonly pluginContainer?: VitePluginContainer;
  };

  return environment.pluginContainer ?? null;
}

function modeFromContext(context: ThisParameterType<TransformHook>): "build" | "serve" {
  const environment = context.environment as {
    readonly config?: {
      readonly command?: "build" | "serve";
    };
  };

  return environment.config?.command ?? "build";
}

function environmentKey(environment: ModuleEnvironment, resolvedId: string): string {
  return `${environment.name}:${environment.consumer}:${resolvedId}`;
}

function adaptEmission(
  context: ModuleMetadataContext,
  moduleId: string,
  emission: EmissionDecision | undefined,
): CompilerTransformResult | null | undefined {
  if (emission === undefined) return undefined;

  switch (emission.kind) {
    case "code":
      return transformResult(context, moduleId, emission.code);

    case "empty":
      return transformResult(context, moduleId, "export {};\n");

    case "opaque":
    case "passthrough":
      return null;
  }
}

interface CompilerTransformResult {
  readonly code: string;
  readonly map: null;
  readonly moduleSideEffects?: boolean | "no-treeshake";
}

interface ModuleMetadataContext {
  getModuleInfo?(
    id: string,
  ): { readonly moduleSideEffects: boolean | "no-treeshake" | null } | null;
}

function transformResult(
  context: ModuleMetadataContext,
  moduleId: string,
  code: string,
): CompilerTransformResult {
  const moduleSideEffects = moduleSideEffectsFor(context, moduleId);

  return moduleSideEffects === null || moduleSideEffects === undefined
    ? { code, map: null }
    : { code, map: null, moduleSideEffects };
}

function moduleSideEffectsFor(
  context: ModuleMetadataContext,
  moduleId: string,
): boolean | "no-treeshake" | null | undefined {
  try {
    return context.getModuleInfo?.(moduleId)?.moduleSideEffects;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('"moduleSideEffects" property of ModuleInfo is not supported')
    ) {
      return undefined;
    }

    throw error;
  }
}

function shouldCompileGraphEntrypoint(moduleId: string, includeDirs: readonly string[]): boolean {
  const filePath = filePathFromModuleId(moduleId);
  if (filePath === null) return false;
  return shouldCompile(filePath, includeDirs);
}

function isNodeModuleId(moduleId: string): boolean {
  const filePath = filePathFromModuleId(moduleId);
  return filePath !== null && filePath.includes("/node_modules/");
}

function moduleIdFromViteId(id: string): string | null {
  if (id.startsWith("\0")) return null;
  if (isFrameworkGeneratedQuery(id)) return null;

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

function isFrameworkGeneratedQuery(id: string): boolean {
  return id.includes("?tsr-shared=");
}

function isInside(filePath: string, dir: string): boolean {
  const relative = path.relative(dir, filePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

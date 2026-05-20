import type { ProgramModuleKind } from "../ir/core/ProgramModule";

export type ModuleEnvironmentConsumer = "client" | "server";

export interface ModuleEnvironment {
  readonly name: string;
  readonly consumer: ModuleEnvironmentConsumer;
}

/**
 * Module-system services used to build a compiler program.
 *
 * The compiler asks the host to resolve module specifiers and load resolved
 * module contents. Initial hosts can be filesystem-only; bundler hosts can
 * later delegate to Vite/Rollup resolution and loading.
 */
export interface ModuleHost {
  /**
   * Resolves a module specifier from an importing module.
   */
  resolve(specifier: string, importer: string | null): Promise<ResolvedModule>;

  /**
   * Loads source and kind information for a resolved module.
   */
  load(resolved: ResolvedModule): Promise<LoadedModule>;
}

/**
 * Result of host module resolution.
 *
 * This is a transient host record, not a compiler graph node. The program
 * builder uses `resolvedId` to deduplicate or create `ProgramModule` objects.
 */
export interface ResolvedModule {
  /**
   * Canonical host identity for this module.
   *
   * This is usually an absolute file path, but bundler hosts may use virtual
   * module ids or external ids.
   */
  readonly resolvedId: string;

  /**
   * Whether this module is outside compiler inspection.
   */
  readonly external: boolean;
}

/**
 * Resolved module contents supplied by the host.
 *
 * This is a transient host record. Supported source modules are later lowered
 * into `ModuleIR` and attached to a compiler-owned `ProgramModule`.
 */
export interface LoadedModule {
  /**
   * Canonical host identity for this module.
   */
  readonly resolvedId: string;

  /**
   * Source text for modules the compiler can inspect.
   *
   * Null means the module is opaque or external.
   */
  readonly source: string | null;

  /**
   * Host-level source kind for this resolved module.
   */
  readonly kind: ProgramModuleKind;
}

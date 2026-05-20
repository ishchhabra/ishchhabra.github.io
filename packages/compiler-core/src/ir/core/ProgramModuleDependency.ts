import { ProgramModule } from "./ProgramModule";

/**
 * Resolved dependency between two modules in a compiler program.
 *
 * Syntax-level import/export records keep the raw source text. Dependencies are
 * graph-level edges created after host resolution maps that source text to a
 * concrete program module.
 */
export type ProgramModuleDependency =
  | ProgramStaticImportDependency
  | ProgramReExportDependency
  | ProgramDynamicImportDependency;

interface BaseProgramModuleDependency {
  /**
   * Module that declares the dependency.
   */
  readonly from: ProgramModule;

  /**
   * Resolved module targeted by the dependency.
   */
  readonly to: ProgramModule;

  /**
   * Raw module specifier from source text.
   *
   * @example
   * ```js
   * import "./setup.js";
   * export { value } from "./dep.js";
   * ```
   */
  readonly specifier: string;
}

/**
 * Static import dependency.
 *
 * @example
 * ```js
 * import value from "./dep.js";
 * import "./setup.js";
 * ```
 */
export interface ProgramStaticImportDependency extends BaseProgramModuleDependency {
  readonly kind: "static-import";
}

/**
 * Static re-export dependency.
 
* @example
 * ```js
 * export { value } from "./dep.js";
 * export * from "./dep.js";
 * ```
 */
export interface ProgramReExportDependency extends BaseProgramModuleDependency {
  readonly kind: "re-export";
}

/**
 * Dynamic import dependency with a statically resolved target.
 *
 * Dynamic imports with non-static specifiers should be represented as opaque
 * effects instead of graph dependencies until the compiler can model them.
 *
 * @example
 * ```js
 * import("./dep.js");
 * ```
 */
export interface ProgramDynamicImportDependency extends BaseProgramModuleDependency {
  readonly kind: "dynamic-import";
}

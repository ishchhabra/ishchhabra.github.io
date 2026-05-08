import type { ModuleAttribute, ModuleExportName } from "./ModuleName";
import type { DeclarationId } from "./Value";

/**
 * Static import record owned by a module.
 *
 * Static imports are module-linkage metadata, not executable operations in the
 * module entry function. Imported bindings are created during module
 * instantiation and read later through normal binding operations.
 *
 * @example
 * ```js
 * import "./setup.js";
 * import value from "./mod.js";
 * import * as ns from "./mod.js";
 * import { read as load } from "./mod.js";
 * import data from "./data.json" with { type: "json" };
 * ```
 */
export type ModuleImport =
  | ModuleBareImport
  | ModuleDefaultImport
  | ModuleNamespaceImport
  | ModuleNamedImport;

interface BaseModuleImport {
  readonly source: string;
  readonly attributes: readonly ModuleAttribute[];
}

/**
 * Bare static import declaration.
 *
 * This imports no local bindings. The imported module is still linked and
 * evaluated for module-level effects before this module evaluates.
 *
 * @example
 * ```js
 * import "./setup.js";
 * ```
 */
export interface ModuleBareImport extends BaseModuleImport {
  readonly kind: "bare";
}

/**
 * Default import binding.
 *
 * @example
 * ```js
 * import value from "./mod.js";
 * ```
 */
export interface ModuleDefaultImport extends BaseModuleImport {
  readonly kind: "default";
  readonly localName: string;
  readonly declarationId: DeclarationId;
}

/**
 * Namespace import binding.
 *
 * @example
 * ```js
 * import * as ns from "./mod.js";
 * ```
 */
export interface ModuleNamespaceImport extends BaseModuleImport {
  readonly kind: "namespace";
  readonly localName: string;
  readonly declarationId: DeclarationId;
}

/**
 * Named import binding.
 *
 * `importedName` is the exported name from the source module. `localName` is
 * the binding introduced in this module.
 *
 * @example
 * ```js
 * import { read } from "./mod.js";
 * import { read as load } from "./mod.js";
 * import { "remote-name" as local } from "./mod.js";
 * ```
 */
export interface ModuleNamedImport extends BaseModuleImport {
  readonly kind: "named";
  readonly importedName: ModuleExportName;
  readonly localName: string;
  readonly declarationId: DeclarationId;
}

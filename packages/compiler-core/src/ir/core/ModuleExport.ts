import type { ModuleAttribute, ModuleExportName } from "./ModuleName";
import type { DeclarationId, Value } from "./Value";

/**
 * Static export record owned by a module.
 *
 * Exports describe the module's public interface. Local exports point at
 * declarations lowered elsewhere in the IR. Re-exports are linker metadata and
 * do not introduce executable operations.
 *
 * @example
 * ```js
 * export { value };
 * export { value as renamed };
 * export { value as "public-name" };
 * export { read } from "./mod.js";
 * export * from "./mod.js";
 * export * as ns from "./mod.js";
 * export default value;
 * ```
 */
export type ModuleExport =
  | ModuleLocalExport
  | ModuleDefaultLocalExport
  | ModuleDefaultValueExport
  | ModuleReExport
  | ModuleExportAll;

/**
 * Export of a local declaration.
 *
 * @example
 * ```js
 * const value = 1;
 * export { value };
 * export { value as "public-name" };
 * ```
 */
export interface ModuleLocalExport {
  readonly kind: "local";
  readonly localName: string;
  readonly exportedName: ModuleExportName;
  readonly declarationId: DeclarationId;
}

/**
 * Default export of a local declaration.
 *
 * @example
 * ```js
 * export default function f() {}
 * export default class C {}
 * export { value as default };
 * ```
 */
export interface ModuleDefaultLocalExport {
  readonly kind: "default-local";
  readonly declarationId: DeclarationId;
}

/**
 * Default export of a runtime value.
 *
 * This models expression defaults and anonymous function/class defaults without
 * inventing a source binding.
 *
 * @example
 * ```js
 * export default foo();
 * export default function () {}
 * export default class {}
 * ```
 */
export interface ModuleDefaultValueExport {
  readonly kind: "default-value";
  readonly value: Value;
}

/**
 * Re-export of a named export from another module.
 *
 * This does not create a local binding.
 *
 * @example
 * ```js
 * export { read } from "./mod.js";
 * export { read as load } from "./mod.js";
 * export { "remote-name" as local } from "./mod.js";
 * ```
 */
export interface ModuleReExport {
  readonly kind: "re-export";
  readonly source: string;
  readonly importedName: ModuleExportName;
  readonly exportedName: ModuleExportName;
  readonly attributes: readonly ModuleAttribute[];
}

/**
 * Re-export all exports from another module.
 *
 * `exportedName: null` represents `export * from "./mod.js"`. A non-null value
 * represents namespace re-export syntax.
 *
 * @example
 * ```js
 * export * from "./mod.js";
 * export * as ns from "./mod.js";
 * ```
 */
export interface ModuleExportAll {
  readonly kind: "export-all";
  readonly source: string;
  readonly exportedName: ModuleExportName | null;
  readonly attributes: readonly ModuleAttribute[];
}

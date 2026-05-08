/**
 * Imported or exported binding name in module linkage syntax.
 *
 * ECMAScript module names are strings semantically, but source syntax can
 * spell them as identifiers or string literals.
 *
 * @example
 * ```js
 * export { value as renamed };
 * export { value as "not-an-identifier" };
 * export { "remote-name" as local } from "./mod.js";
 * ```
 */
export type ModuleExportName =
  | { readonly kind: "identifier"; readonly name: string }
  | { readonly kind: "string"; readonly value: string };

/**
 * Static import/export attribute.
 *
 * Import attributes are linkage metadata, not runtime operations.
 *
 * @example
 * ```js
 * import data from "./data.json" with { type: "json" };
 * export { data } from "./data.json" with { type: "json" };
 * ```
 */
export interface ModuleAttribute {
  readonly key: ModuleExportName;
  readonly value: string;
}

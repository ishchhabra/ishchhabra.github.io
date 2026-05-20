declare const opaqueModuleId: unique symbol;

/**
 * Stable identity of a module in one compiler program.
 *
 * Module ids identify resolved module units whether or not they have lowered
 * IR. They are for diagnostics, maps, and serialization; they do not imply
 * filesystem identity or module loading order.
 */
export type ModuleId = number & {
  readonly [opaqueModuleId]: "ModuleId";
};

export function makeModuleId(id: number): ModuleId {
  return id as ModuleId;
}

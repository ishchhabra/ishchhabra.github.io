import type { DeclarationId, Value } from "../core/Value";

/**
 * Memory location taxonomy — the alphabet the alias oracle speaks in.
 *
 * Every effectful op expresses its reads/writes as a set of
 * {@link MemoryLocation} handles. The oracle answers "could two
 * locations alias?"; MemorySSA uses the answer to thread MemoryUse
 * nodes at each load back to the dominating MemoryDef.
 *
 * The taxonomy is deliberately dumb at v1: one kind per IR-level
 * binding concept, no heap-alias reasoning, no type-sensitive
 * aggregation. Expansions (field-sensitive heap, typed cell
 * partitions) land in later stages without changing consumers.
 */
export type MemoryLocation =
  | { readonly kind: "local"; readonly declarationId: DeclarationId }
  | { readonly kind: "context"; readonly declarationId: DeclarationId }
  | { readonly kind: "exported"; readonly modulePath: string; readonly name: string }
  | { readonly kind: "staticProperty"; readonly object: Value; readonly name: string }
  | { readonly kind: "computedProperty"; readonly object: Value }
  | { readonly kind: "unknown" };

export const UnknownLocation: MemoryLocation = { kind: "unknown" };

export function localLocation(declarationId: DeclarationId): MemoryLocation {
  return { kind: "local", declarationId };
}

export function contextLocation(declarationId: DeclarationId): MemoryLocation {
  return { kind: "context", declarationId };
}

export function staticPropertyLocation(object: Value, name: string): MemoryLocation {
  return { kind: "staticProperty", object, name };
}

export function computedPropertyLocation(object: Value): MemoryLocation {
  return { kind: "computedProperty", object };
}

/**
 * Canonical string key for a location. Used to group defs that write
 * the exact same location (identity-level merge) — distinct from
 * alias-level merge which the oracle handles.
 */
export function locationKey(loc: MemoryLocation): string {
  switch (loc.kind) {
    case "local":
      return `L:${loc.declarationId}`;
    case "context":
      return `C:${loc.declarationId}`;
    case "exported":
      return `E:${loc.modulePath}::${loc.name}`;
    case "staticProperty":
      return `S:${loc.object.id}.${loc.name}`;
    case "computedProperty":
      return `P:${loc.object.id}`;
    case "unknown":
      return "U";
  }
}

/**
 * A concrete op's effect declaration. Pure ops return empty on both.
 * Ops that write "anywhere" (unknown calls) include `UnknownLocation`
 * in `writes` — the alias oracle treats unknown as universal.
 */
export interface MemoryEffects {
  readonly reads: readonly MemoryLocation[];
  readonly writes: readonly MemoryLocation[];
}

export const NoEffects: MemoryEffects = Object.freeze({ reads: [], writes: [] });

export function effects(
  reads: readonly MemoryLocation[],
  writes: readonly MemoryLocation[],
): MemoryEffects {
  return { reads, writes };
}

import type { DeclarationId, ValueId } from "../core/Value";

/**
 * Abstract memory region that an operation may read or write.
 *
 * Memory locations are alias-analysis categories, not runtime objects. They
 * should be precise enough for compiler passes to prove independence, but
 * conservative enough to represent unknown JavaScript behavior.
 */
export type MemoryLocation =
  | UnknownMemoryLocation
  | BindingMemoryLocation
  | GlobalMemoryLocation
  | PropertyMemoryLocation
  | ValueMemoryLocation;

/**
 * Unknown memory.
 *
 * This aliases every other memory location and is the conservative fallback for
 * opaque calls, proxies, dynamic reflection, and operations whose behavior has
 * not been modeled yet.
 */
export interface UnknownMemoryLocation {
  readonly kind: "unknown";
}

/**
 * Source binding storage.
 *
 * This models reads and writes of declaration-backed bindings such as `let`,
 * `const`, `var`, parameters, catch parameters, and imports.
 */
export interface BindingMemoryLocation {
  readonly kind: "binding";
  readonly declarationId: DeclarationId;
}

/**
 * Global object binding or host-global access.
 *
 * This is separate from source bindings because global property access can
 * observe host state and may alias object property effects.
 */
export interface GlobalMemoryLocation {
  readonly kind: "global";
  readonly name: string;
}

/**
 * Property storage on an object value.
 *
 * Known keys allow finer aliasing for common `obj.x`, `obj["x"]`, and
 * well-known-symbol patterns. Unknown keys conservatively represent computed
 * keys that cannot be resolved.
 */
export interface PropertyMemoryLocation {
  readonly kind: "property";
  readonly objectId: ValueId;
  readonly key: PropertyLocationKey;
}

/**
 * Materialized JavaScript local storage for an IR value.
 *
 * SSA elimination uses this when a block parameter must become an assignable
 * JavaScript local. It is separate from binding memory because the source
 * binding has already been promoted out of declaration storage.
 */
export interface ValueMemoryLocation {
  readonly kind: "value";
  readonly valueId: ValueId;
}

/**
 * Property key known to alias analysis.
 *
 * This describes what the compiler knows about the key, not the syntax used to
 * access it. For example, `obj["x"]` is a named key, while `obj[x]` is unknown
 * unless `x` is proven constant.
 */
export type PropertyLocationKey =
  | { readonly kind: "named"; readonly name: string }
  | { readonly kind: "symbol"; readonly name: string }
  | { readonly kind: "unknown" };

export const UnknownMemoryLocation: UnknownMemoryLocation = {
  kind: "unknown",
} as const;

export function bindingMemoryLocation(
  declarationId: DeclarationId,
): BindingMemoryLocation {
  return { kind: "binding", declarationId } as const;
}

export function globalMemoryLocation(name: string): GlobalMemoryLocation {
  return { kind: "global", name } as const;
}

export function namedPropertyMemoryLocation(
  objectId: ValueId,
  name: string,
): PropertyMemoryLocation {
  return {
    kind: "property",
    objectId,
    key: { kind: "named", name },
  };
}

export function symbolPropertyMemoryLocation(
  objectId: ValueId,
  name: string,
): PropertyMemoryLocation {
  return {
    kind: "property",
    objectId,
    key: { kind: "symbol", name },
  };
}

export function unknownPropertyMemoryLocation(
  objectId: ValueId,
): PropertyMemoryLocation {
  return {
    kind: "property",
    objectId,
    key: { kind: "unknown" },
  };
}

export function valueMemoryLocation(valueId: ValueId): ValueMemoryLocation {
  return { kind: "value", valueId } as const;
}

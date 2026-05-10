import type { OperationId } from "../core/Operation";
import type { DeclarationId, ValueId } from "../core/Value";

/**
 * Abstract memory region that an operation may read or write.
 *
 * Memory locations name storage categories. They are not runtime objects:
 * object identity is modeled through abstract object sets, and compiler-created
 * slots are intentionally separate from JavaScript-observable memory.
 */
export type MemoryLocation =
  | UnknownMemoryLocation
  | BindingMemoryLocation
  | GlobalMemoryLocation
  | HeapPropertyMemoryLocation
  | HeapShapeMemoryLocation
  | PrototypeMemoryLocation
  | IteratorMemoryLocation
  | CompilerSlotMemoryLocation;

/**
 * Unknown JavaScript-observable memory.
 *
 * This aliases binding, global, heap, prototype, and iterator memory. It does
 * not alias compiler slots, because JavaScript cannot observe or mutate the
 * compiler's materialized SSA storage except through explicit IR operands.
 *
 * @example
 * ```js
 * unknownCall(obj);
 * ```
 * An opaque call may read or write unknown JavaScript-observable memory.
 */
export interface UnknownMemoryLocation {
  readonly kind: "unknown";
}

/**
 * Source binding storage.
 *
 * This models JavaScript declaration-backed bindings. It is not a replacement
 * for compiler slots: binding memory is source-observable through closures,
 * imports/exports, direct eval, and module/global semantics.
 *
 * @example
 * ```js
 * let x = 1;
 * x = 2;
 * ```
 * The declaration cell for `x` is binding memory.
 */
export interface BindingMemoryLocation {
  readonly kind: "binding";
  readonly declarationId: DeclarationId;
  readonly scope: BindingMemoryScope;
}

export type BindingMemoryScope = "local" | "context" | "module";

/**
 * Global object or host-global access.
 *
 * `name: null` represents an unknown global property.
 *
 * @example
 * ```js
 * console.log(window.location);
 * ```
 * `window` and host globals are global memory, not local binding memory.
 */
export interface GlobalMemoryLocation {
  readonly kind: "global";
  readonly name: string | null;
}

/**
 * Object property storage.
 *
 * The base is a points-to abstraction, not a single SSA value. That lets later
 * points-to analysis canonicalize aliases such as `const b = a`.
 *
 * @example
 * ```js
 * obj.x = 1;
 * console.log(obj.x);
 * ```
 * The `x` cell on objects that `obj` may reference is heap-property memory.
 */
export interface HeapPropertyMemoryLocation {
  readonly kind: "heap-property";
  readonly base: AbstractObjectSet;
  readonly key: PropertyKeySet;
}

/**
 * Object shape storage.
 *
 * Shape covers property existence, deletion, enumeration order, and other
 * structural effects that are not the value of one property cell.
 *
 * @example
 * ```js
 * delete obj.x;
 * Object.keys(obj);
 * ```
 * Deleting or enumerating properties observes object shape.
 */
export interface HeapShapeMemoryLocation {
  readonly kind: "heap-shape";
  readonly base: AbstractObjectSet;
}

/**
 * Prototype-chain lookup state for a key.
 *
 * @example
 * ```js
 * obj.x;
 * Object.setPrototypeOf(obj, proto);
 * ```
 * A property read may consult prototype memory when the own property is absent.
 */
export interface PrototypeMemoryLocation {
  readonly kind: "prototype";
  readonly base: AbstractObjectSet;
  readonly key: PropertyKeySet;
}

/**
 * Iterator state derived from an object.
 *
 * @example
 * ```js
 * for (const value of iterable) {}
 * ```
 * Iterator protocol operations may mutate iterator state independent of normal
 * property cells.
 */
export interface IteratorMemoryLocation {
  readonly kind: "iterator";
  readonly base: AbstractObjectSet;
}

/**
 * Compiler-created storage for a materialized SSA value.
 *
 * SSA elimination uses this when a block parameter must become an assignable
 * JavaScript local in emitted code. It is not JavaScript-observable memory.
 *
 * @example
 * ```txt
 * then:
 *   jump join(x = a)
 * else:
 *   jump join(x = b)
 * join(x):
 *   return x
 *
 * // After SSA elimination:
 * then:
 *   CopyValueOp(x, a)
 * else:
 *   CopyValueOp(x, b)
 * join:
 *   return x
 * ```
 * The writable storage for materialized block parameter `x` is a compiler slot,
 * not the JavaScript binding named `x`.
 */
export interface CompilerSlotMemoryLocation {
  readonly kind: "compiler-slot";
  readonly valueId: ValueId;
}

/**
 * Abstract object identity used by heap memory locations.
 *
 * @example
 * ```js
 * const a = {};
 * const b = a;
 * ```
 * A future points-to analysis should map both `a` and `b` to the same
 * allocation abstract object.
 */
export type AbstractObject =
  | AllocationAbstractObject
  | SsaValueAbstractObject
  | ArgumentAbstractObject
  | GlobalObjectAbstractObject
  | ModuleNamespaceAbstractObject
  | ExternalAbstractObject
  | UnknownAbstractObject;

/**
 * Object identity from a known allocation operation.
 *
 * @example
 * ```js
 * const obj = {};
 * obj.x = 1;
 * ```
 * The object literal operation is the allocation identity for `obj`.
 */
export interface AllocationAbstractObject {
  readonly kind: "allocation";
  readonly operationId: OperationId;
}

/**
 * Object identity approximated by an SSA value.
 *
 * This is a fallback until points-to analysis can map the value back to a
 * better allocation, argument, global, module, or external identity.
 *
 * @example
 * ```js
 * const obj = getObject();
 * obj.x = 1;
 * ```
 * The result value of `getObject()` can stand in as the object identity.
 */
export interface SsaValueAbstractObject {
  readonly kind: "ssa-value";
  readonly valueId: ValueId;
}

/**
 * Object identity supplied by a function argument.
 *
 * @example
 * ```js
 * function update(obj) {
 *   obj.x = 1;
 * }
 * ```
 * `obj` is represented as argument object `0`.
 */
export interface ArgumentAbstractObject {
  readonly kind: "argument";
  readonly index: number;
}

/**
 * The JavaScript global object.
 *
 * @example
 * ```js
 * globalThis.appState = 1;
 * ```
 * `globalThis` is represented as the global object identity.
 */
export interface GlobalObjectAbstractObject {
  readonly kind: "global-object";
}

/**
 * ECMAScript module namespace object.
 *
 * @example
 * ```js
 * import * as ns from "./mod.js";
 * console.log(ns.value);
 * ```
 * `ns` is represented by the imported module namespace identity.
 */
export interface ModuleNamespaceAbstractObject {
  readonly kind: "module-namespace";
  readonly moduleName: string;
}

/**
 * Object identity owned by host or external code.
 *
 * @example
 * ```js
 * const element = document.body;
 * element.dataset.ready = "true";
 * ```
 * Host objects are external when the compiler cannot model their allocation.
 */
export interface ExternalAbstractObject {
  readonly kind: "external";
}

/**
 * Unknown object identity.
 *
 * @example
 * ```js
 * const obj = opaque();
 * obj.x = 1;
 * ```
 * Use this when the compiler cannot name even a conservative object bucket.
 */
export interface UnknownAbstractObject {
  readonly kind: "unknown";
}

export type AbstractObjectSet =
  | { readonly kind: "known"; readonly objects: readonly AbstractObject[] }
  | { readonly kind: "unknown" };

/**
 * Set of ECMAScript property keys described by a memory location.
 *
 * Property keys are strings or symbols. Number syntax is normalized before it
 * reaches the object: `obj[0]` and `obj["0"]` both access string key `"0"`.
 *
 * @example
 * ```js
 * obj.x;      // exact string key "x"
 * obj[0];    // exact string key "0", which is an array index
 * obj[i];    // array-index, unknown-string, or unknown depending on analysis
 * obj[sym];  // exact or unknown symbol key
 * ```
 */
export type PropertyKeySet =
  | ExactStringPropertyKeySet
  | ArrayIndexPropertyKeySet
  | NonArrayStringPropertyKeySet
  | UnknownStringPropertyKeySet
  | ExactSymbolPropertyKeySet
  | UnknownSymbolPropertyKeySet
  | UnknownPropertyKeySet;

/**
 * One known string-valued property key.
 *
 * @example
 * ```js
 * obj.x;
 * obj["x"];
 * obj[0];
 * ```
 * `obj[0]` is represented as string key `"0"`.
 */
export interface ExactStringPropertyKeySet {
  readonly kind: "string";
  readonly value: string;
}

/**
 * Any string-valued property key that is an array index.
 *
 * @example
 * ```js
 * arr[i];
 * ```
 * Use this only when analysis proves `i` is in the array-index domain.
 */
export interface ArrayIndexPropertyKeySet {
  readonly kind: "array-index";
}

/**
 * Any string-valued property key that is not an array index.
 *
 * @example
 * ```js
 * obj[key];
 * ```
 * Use this when analysis proves `key` is a string but excludes array indices.
 */
export interface NonArrayStringPropertyKeySet {
  readonly kind: "non-array-string";
}

/**
 * Unknown string-valued property key.
 *
 * @example
 * ```js
 * obj[String(key)];
 * ```
 * Use this when the key is known to be a string but no narrower set is known.
 */
export interface UnknownStringPropertyKeySet {
  readonly kind: "unknown-string";
}

/**
 * One known symbol-valued property key.
 *
 * @example
 * ```js
 * obj[Symbol.iterator];
 * ```
 */
export interface ExactSymbolPropertyKeySet {
  readonly kind: "symbol";
  readonly identity: SymbolIdentity;
}

/**
 * Unknown symbol-valued property key.
 *
 * @example
 * ```js
 * obj[sym];
 * ```
 * Use this when analysis proves `sym` is a symbol but cannot identify which.
 */
export interface UnknownSymbolPropertyKeySet {
  readonly kind: "unknown-symbol";
}

/**
 * Unknown property key of any ECMAScript key type.
 *
 * @example
 * ```js
 * obj[key];
 * ```
 * Use this when the key may be either a string or a symbol.
 */
export interface UnknownPropertyKeySet {
  readonly kind: "unknown";
}

/**
 * Identity for an exact symbol property key.
 */
export type SymbolIdentity =
  | { readonly kind: "well-known"; readonly name: string }
  | { readonly kind: "global-registry"; readonly key: string }
  | { readonly kind: "allocation"; readonly operationId: OperationId }
  | { readonly kind: "ssa-value"; readonly valueId: ValueId };

export const UnknownMemoryLocation: UnknownMemoryLocation = {
  kind: "unknown",
} as const;

export function bindingMemoryLocation(
  declarationId: DeclarationId,
  scope: BindingMemoryScope = "local",
): BindingMemoryLocation {
  return { kind: "binding", declarationId, scope } as const;
}

export function globalMemoryLocation(name: string | null = null): GlobalMemoryLocation {
  return { kind: "global", name } as const;
}

export function heapPropertyMemoryLocation(
  base: AbstractObjectSet,
  key: PropertyKeySet,
): HeapPropertyMemoryLocation {
  return { kind: "heap-property", base, key } as const;
}

export function heapShapeMemoryLocation(base: AbstractObjectSet): HeapShapeMemoryLocation {
  return { kind: "heap-shape", base } as const;
}

export function prototypeMemoryLocation(
  base: AbstractObjectSet,
  key: PropertyKeySet,
): PrototypeMemoryLocation {
  return { kind: "prototype", base, key } as const;
}

export function iteratorMemoryLocation(base: AbstractObjectSet): IteratorMemoryLocation {
  return { kind: "iterator", base } as const;
}

export function compilerSlotMemoryLocation(valueId: ValueId): CompilerSlotMemoryLocation {
  return { kind: "compiler-slot", valueId } as const;
}

export function ssaValueObjectSet(valueId: ValueId): AbstractObjectSet {
  return {
    kind: "known",
    objects: [{ kind: "ssa-value", valueId }],
  };
}

export function stringPropertyMemoryLocation(
  objectId: ValueId,
  value: string,
): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "string",
    value,
  });
}

export function arrayIndexPropertyMemoryLocation(objectId: ValueId): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "array-index",
  });
}

export function nonArrayStringPropertyMemoryLocation(
  objectId: ValueId,
): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "non-array-string",
  });
}

export function unknownStringPropertyMemoryLocation(objectId: ValueId): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "unknown-string",
  });
}

export function symbolPropertyMemoryLocation(
  objectId: ValueId,
  identity: SymbolIdentity,
): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "symbol",
    identity,
  });
}

export function unknownSymbolPropertyMemoryLocation(objectId: ValueId): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "unknown-symbol",
  });
}

export function unknownPropertyMemoryLocation(objectId: ValueId): HeapPropertyMemoryLocation {
  return heapPropertyMemoryLocation(ssaValueObjectSet(objectId), {
    kind: "unknown",
  });
}

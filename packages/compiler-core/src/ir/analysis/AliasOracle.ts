import type { Operation } from "../core/Operation";
import type {
  AbstractObject,
  AbstractObjectSet,
  BindingMemoryLocation,
  GlobalMemoryLocation,
  HeapPropertyMemoryLocation,
  MemoryLocation,
  PropertyKeySet,
} from "../effects";

/**
 * Relationship between two abstract memory locations.
 */
export type AliasResult = "no-alias" | "may-alias" | "must-alias";

/**
 * Whether an operation may read and/or write a memory location.
 */
export type ModRefInfo = "no-mod-ref" | "ref" | "mod" | "mod-ref";

/**
 * Conservative alias and mod/ref queries for IR memory locations.
 *
 * The oracle must prefer `may-alias` over unsound precision. It is intentionally
 * small: points-to and escape analyses should improve the locations passed into
 * this oracle, rather than turning this class into a semantic catch-all.
 */
export class AliasOracle {
  /**
   * Classifies whether two memory locations can refer to the same storage.
   */
  public alias(left: MemoryLocation, right: MemoryLocation): AliasResult {
    if (left.kind === "compiler-slot" || right.kind === "compiler-slot") {
      return aliasCompilerSlot(left, right);
    }

    if (left.kind === "unknown" || right.kind === "unknown") {
      return "may-alias";
    }

    if (left.kind === "binding") {
      return right.kind === "binding" ? aliasSameBinding(left, right) : "no-alias";
    }

    if (left.kind === "global") {
      return right.kind === "global" ? aliasSameGlobal(left, right) : "no-alias";
    }

    if (left.kind === "heap-property") {
      return right.kind === "heap-property"
        ? aliasSameHeapProperty(left, right)
        : aliasHeapWithStructuralLocation(left, right);
    }

    if (left.kind === "heap-shape") {
      return aliasStructuralWithLocation(left.base, right);
    }

    if (left.kind === "prototype") {
      return aliasStructuralWithLocation(left.base, right, left.key);
    }

    return aliasStructuralWithLocation(left.base, right);
  }

  /**
   * Returns whether two locations might overlap.
   */
  public mayAlias(left: MemoryLocation, right: MemoryLocation): boolean {
    return this.alias(left, right) !== "no-alias";
  }

  /**
   * Returns whether two locations are definitely the same storage.
   */
  public mustAlias(left: MemoryLocation, right: MemoryLocation): boolean {
    return this.alias(left, right) === "must-alias";
  }

  /**
   * Classifies whether an operation may read or write a location.
   *
   * This is the standard mod/ref query:
   * - `ref`: may read
   * - `mod`: may write
   * - `mod-ref`: may read and write
   * - `no-mod-ref`: cannot access the location
   */
  public getModRefInfo(op: Operation, location: MemoryLocation): ModRefInfo {
    const effects = op.effects();
    const mayRead = effects.memory.reads.some((read) => this.mayAlias(read, location));
    const mayWrite = effects.memory.writes.some((write) => this.mayAlias(write, location));

    if (mayRead && mayWrite) return "mod-ref";
    if (mayWrite) return "mod";
    if (mayRead) return "ref";
    return "no-mod-ref";
  }

  /**
   * Returns whether an operation may read from a location.
   */
  public mayRead(op: Operation, location: MemoryLocation): boolean {
    const info = this.getModRefInfo(op, location);
    return info === "ref" || info === "mod-ref";
  }

  /**
   * Returns whether an operation may write to a location.
   */
  public mayWrite(op: Operation, location: MemoryLocation): boolean {
    const info = this.getModRefInfo(op, location);
    return info === "mod" || info === "mod-ref";
  }

  /**
   * Returns whether an operation may read or write a location.
   */
  public mayAccess(op: Operation, location: MemoryLocation): boolean {
    return this.getModRefInfo(op, location) !== "no-mod-ref";
  }

  /**
   * Returns whether later operations cannot be freely moved before this op.
   *
   * A control barrier may throw, loop forever, or perform observable behavior.
   * Optimizations use this to avoid moving effects across control boundaries.
   */
  public isControlBarrier(op: Operation): boolean {
    const effects = op.effects();
    return effects.mayThrow || effects.mayDiverge || effects.isObservable;
  }
}

function aliasCompilerSlot(left: MemoryLocation, right: MemoryLocation): AliasResult {
  if (left.kind !== "compiler-slot" || right.kind !== "compiler-slot") {
    return "no-alias";
  }

  return left.valueId === right.valueId ? "must-alias" : "no-alias";
}

function aliasSameBinding(left: BindingMemoryLocation, right: BindingMemoryLocation): AliasResult {
  return left.scope === right.scope && left.declarationId === right.declarationId
    ? "must-alias"
    : "no-alias";
}

function aliasSameGlobal(left: GlobalMemoryLocation, right: GlobalMemoryLocation): AliasResult {
  if (left.name === null && right.name === null) return "may-alias";
  if (left.name === null || right.name === null) return "may-alias";
  return left.name === right.name ? "must-alias" : "no-alias";
}

function aliasSameHeapProperty(
  left: HeapPropertyMemoryLocation,
  right: HeapPropertyMemoryLocation,
): AliasResult {
  return combineAliasResults(
    aliasObjectSets(left.base, right.base),
    aliasPropertyKeys(left.key, right.key),
  );
}

function aliasHeapWithStructuralLocation(
  heap: HeapPropertyMemoryLocation,
  location: MemoryLocation,
): AliasResult {
  if (location.kind === "heap-shape" || location.kind === "iterator") {
    return aliasObjectSets(heap.base, location.base) === "no-alias" ? "no-alias" : "may-alias";
  }

  if (location.kind === "prototype") {
    return combineAliasResults(
      aliasObjectSets(heap.base, location.base),
      aliasPropertyKeys(heap.key, location.key),
    ) === "no-alias"
      ? "no-alias"
      : "may-alias";
  }

  return "no-alias";
}

function aliasStructuralWithLocation(
  base: AbstractObjectSet,
  location: MemoryLocation,
  key?: PropertyKeySet,
): AliasResult {
  if (location.kind === "heap-property") {
    const objectAlias = aliasObjectSets(base, location.base);
    if (objectAlias === "no-alias") return "no-alias";
    if (key === undefined) return "may-alias";
    return aliasPropertyKeys(key, location.key) === "no-alias" ? "no-alias" : "may-alias";
  }

  if (
    location.kind === "heap-shape" ||
    location.kind === "prototype" ||
    location.kind === "iterator"
  ) {
    return aliasObjectSets(base, location.base) === "no-alias" ? "no-alias" : "may-alias";
  }

  return "no-alias";
}

function aliasObjectSets(left: AbstractObjectSet, right: AbstractObjectSet): AliasResult {
  if (left.kind === "unknown" || right.kind === "unknown") return "may-alias";

  let overlap = false;
  for (const leftObject of left.objects) {
    for (const rightObject of right.objects) {
      const alias = aliasAbstractObjects(leftObject, rightObject);
      if (alias === "may-alias") return "may-alias";
      if (alias === "must-alias") overlap = true;
    }
  }

  if (!overlap) return "no-alias";
  return left.objects.length === 1 && right.objects.length === 1 ? "must-alias" : "may-alias";
}

function aliasAbstractObjects(left: AbstractObject, right: AbstractObject): AliasResult {
  if (left.kind === "unknown" || right.kind === "unknown") return "may-alias";
  if (left.kind === "ssa-value" || right.kind === "ssa-value") {
    return left.kind === "ssa-value" && right.kind === "ssa-value" && left.valueId === right.valueId
      ? "must-alias"
      : "may-alias";
  }
  if (left.kind !== right.kind) return "no-alias";

  switch (left.kind) {
    case "allocation":
      return right.kind === "allocation" && left.operationId === right.operationId
        ? "must-alias"
        : "no-alias";

    case "argument":
      return right.kind === "argument" && left.index === right.index ? "must-alias" : "no-alias";

    case "module-namespace":
      return right.kind === "module-namespace" && left.moduleName === right.moduleName
        ? "must-alias"
        : "no-alias";

    case "global-object":
      return "must-alias";

    case "external":
      return "may-alias";
  }
}

function aliasPropertyKeys(left: PropertyKeySet, right: PropertyKeySet): AliasResult {
  if (left.kind === "unknown" || right.kind === "unknown") {
    return "may-alias";
  }

  if (left.kind === "string") return aliasExactStringPropertyKey(left.value, right);
  if (right.kind === "string") return aliasExactStringPropertyKey(right.value, left);
  if (left.kind === "symbol") return aliasExactSymbolPropertyKey(left, right);
  if (right.kind === "symbol") return aliasExactSymbolPropertyKey(right, left);

  if (isStringPropertyKeySet(left) && isStringPropertyKeySet(right)) {
    return aliasStringPropertyKeySets(left, right);
  }

  if (isSymbolPropertyKeySet(left) && isSymbolPropertyKeySet(right)) {
    return "may-alias";
  }

  return "no-alias";
}

type ExactSymbolPropertyKeySet = Extract<PropertyKeySet, { readonly kind: "symbol" }>;
type SymbolIdentity = ExactSymbolPropertyKeySet["identity"];

function aliasExactStringPropertyKey(value: string, key: PropertyKeySet): AliasResult {
  switch (key.kind) {
    case "string":
      return value === key.value ? "must-alias" : "no-alias";

    case "array-index":
      return isArrayIndexPropertyName(value) ? "may-alias" : "no-alias";

    case "non-array-string":
      return isArrayIndexPropertyName(value) ? "no-alias" : "may-alias";

    case "unknown-string":
    case "unknown":
      return "may-alias";

    case "symbol":
    case "unknown-symbol":
      return "no-alias";
  }
}

function aliasExactSymbolPropertyKey(
  left: ExactSymbolPropertyKeySet,
  right: PropertyKeySet,
): AliasResult {
  switch (right.kind) {
    case "symbol":
      return aliasSymbolIdentities(left.identity, right.identity);

    case "unknown-symbol":
    case "unknown":
      return "may-alias";

    case "string":
    case "array-index":
    case "non-array-string":
    case "unknown-string":
      return "no-alias";
  }
}

function aliasStringPropertyKeySets(left: PropertyKeySet, right: PropertyKeySet): AliasResult {
  if (left.kind === "array-index" && right.kind === "non-array-string") return "no-alias";
  if (left.kind === "non-array-string" && right.kind === "array-index") return "no-alias";
  return "may-alias";
}

function aliasSymbolIdentities(left: SymbolIdentity, right: SymbolIdentity): AliasResult {
  if (left.kind === "ssa-value" || right.kind === "ssa-value") {
    return left.kind === "ssa-value" && right.kind === "ssa-value" && left.valueId === right.valueId
      ? "must-alias"
      : "may-alias";
  }

  if (left.kind !== right.kind) return "no-alias";

  switch (left.kind) {
    case "well-known":
      return right.kind === "well-known" && left.name === right.name ? "must-alias" : "no-alias";

    case "global-registry":
      return right.kind === "global-registry" && left.key === right.key ? "must-alias" : "no-alias";

    case "allocation":
      return right.kind === "allocation" && left.operationId === right.operationId
        ? "must-alias"
        : "no-alias";
  }
}

function isStringPropertyKeySet(key: PropertyKeySet): boolean {
  return (
    key.kind === "array-index" || key.kind === "non-array-string" || key.kind === "unknown-string"
  );
}

function isSymbolPropertyKeySet(key: PropertyKeySet): boolean {
  return key.kind === "unknown-symbol";
}

function isArrayIndexPropertyName(value: string): boolean {
  if (!/^(0|[1-9]\d*)$/.test(value)) return false;
  return Number(value) <= 4294967294;
}

function combineAliasResults(left: AliasResult, right: AliasResult): AliasResult {
  if (left === "no-alias" || right === "no-alias") return "no-alias";
  if (left === "must-alias" && right === "must-alias") return "must-alias";
  return "may-alias";
}

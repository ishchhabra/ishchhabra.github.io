import type { Value } from "../../ir/core/Value";
import type { MemoryLocation } from "../../ir/memory/MemoryLocation";

/**
 * Memory category — Cranelift-style partition. Locations in different
 * categories are *never* aliased; locations in the same category may
 * or may not alias (resolved by `mayAlias`). Partitioning is the
 * cheap precision win — a tag compare before any further oracle work.
 */
export type MemoryCategory =
  | "local" // binding cells private to the function frame
  | "context" // closure-captured cells
  | "exported" // module-scoped bindings visible cross-module
  | "property" // object property reads/writes (static + computed)
  | "unknown"; // universal — may alias anything

export function categoryOf(loc: MemoryLocation): MemoryCategory {
  switch (loc.kind) {
    case "local":
      return "local";
    case "context":
      return "context";
    case "exported":
      return "exported";
    case "staticProperty":
    case "computedProperty":
      return "property";
    case "unknown":
      return "unknown";
  }
}

/**
 * Alias oracle — answers "can these two locations refer to overlapping memory?"
 *
 * Modeled on Cranelift's category-partitioned alias analysis
 * (wasmtime PR #4163): a fast category compare gates everything.
 * Same-category queries fall through to finer rules.
 *
 * Soundness rule: **Value-identity equality proves must-alias.
 * Value-identity inequality does NOT prove must-not-alias** — two
 * distinct SSA Values can point to the same runtime object
 * (`var a = o; var b = o; a.x = ...; b.x = ...;`). The oracle
 * therefore returns `true` whenever the two object-bearing
 * `Value`s differ, unless a conservative "fresh-allocation"
 * check proves disjointness.
 *
 * v1 precision knobs (intentionally modest, expand as needed):
 *
 *   - Binding categories (local / context / exported): fully precise —
 *     keyed by `declarationId` / (modulePath, name), no object identity
 *     to worry about.
 *   - `property` category: uses `isFreshAllocation` as the only
 *     disjointness proof. Two SSA Values whose definers are distinct
 *     allocation ops (object/array literals, `new X()`) are known to
 *     be different objects. Everything else falls back to may-alias.
 *   - `unknown` aliases anything.
 *
 * Invariants: symmetric, reflexive, returning `true` is always sound.
 */
export class AliasOracle {
  public mayAlias(a: MemoryLocation, b: MemoryLocation): boolean {
    if (a.kind === "unknown" || b.kind === "unknown") return true;
    const catA = categoryOf(a);
    const catB = categoryOf(b);
    if (catA !== catB) return false;
    if (a.kind !== b.kind) {
      return this.crossKindSameCategory(a, b);
    }
    switch (a.kind) {
      case "local":
        return a.declarationId === (b as typeof a).declarationId;
      case "context":
        return a.declarationId === (b as typeof a).declarationId;
      case "exported": {
        const bb = b as typeof a;
        return a.modulePath === bb.modulePath && a.name === bb.name;
      }
      case "staticProperty": {
        const bb = b as typeof a;
        // Same Value → same object; names must match.
        if (a.object === bb.object) return a.name === bb.name;
        // Different Values → may still point to the same object at
        // runtime UNLESS both are provably distinct fresh allocations.
        if (isFreshAllocation(a.object) && isFreshAllocation(bb.object)) {
          return false;
        }
        return true;
      }
      case "computedProperty": {
        const bb = b as typeof a;
        if (a.object === bb.object) return true;
        if (isFreshAllocation(a.object) && isFreshAllocation(bb.object)) {
          return false;
        }
        return true;
      }
    }
  }

  /**
   * Different kinds but same category. Only the `property` category
   * has this case today: `computedProperty` may alias any
   * `staticProperty` on the same object (we can't tell which key
   * `o[x]` resolves to). Cross-Value pairs fall back to the same
   * fresh-allocation disjointness proof as above.
   */
  private crossKindSameCategory(a: MemoryLocation, b: MemoryLocation): boolean {
    const objA = (a as { object?: Value }).object;
    const objB = (b as { object?: Value }).object;
    if (objA === undefined || objB === undefined) return true;
    if (objA === objB) return true;
    if (isFreshAllocation(objA) && isFreshAllocation(objB)) return false;
    return true;
  }
}

/**
 * A Value is a "fresh allocation" if its definer op is a literal
 * object/array/function constructor whose result is a new heap object
 * not aliased with anything else. v1 recognition is name-based to
 * avoid coupling the oracle to IR internals — refined over time.
 *
 * Two fresh allocations with *different* defining ops are guaranteed
 * to yield distinct runtime objects.
 */
function isFreshAllocation(value: Value): boolean {
  const def = value.definer;
  if (def === undefined) return false;
  const name = def.constructor.name;
  // Match by class name rather than `instanceof` to keep the oracle
  // independent of the specific Op class file layout. Add new
  // allocation-producing ops here as they appear.
  return (
    name === "ObjectExpressionOp" ||
    name === "ArrayExpressionOp" ||
    name === "NewExpressionOp" ||
    name === "ArrowFunctionExpressionOp" ||
    name === "FunctionExpressionOp" ||
    name === "RegExpLiteralOp" ||
    name === "TaggedTemplateExpressionOp"
  );
}

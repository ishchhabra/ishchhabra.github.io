import type { Operation } from "../core/Operation";
import type { MemoryLocation, PropertyLocationKey } from "../effects";

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
 * The oracle must prefer `may-alias` over unsound precision. Optimization
 * passes use this to prove that writes are dead, reads are independent, or
 * operations cannot observe each other.
 */
export class AliasOracle {
  /**
   * Classifies whether two memory locations can refer to the same storage.
   */
  public alias(left: MemoryLocation, right: MemoryLocation): AliasResult {
    switch (left.kind) {
      case "unknown":
        return "may-alias";

      case "binding":
        return right.kind === "binding"
          ? aliasSameBinding(left, right)
          : aliasDifferentKinds(right);

      case "global":
        return right.kind === "global"
          ? aliasSameGlobal(left, right)
          : aliasDifferentKinds(right);

      case "property":
        return right.kind === "property"
          ? aliasSameProperty(left, right)
          : aliasDifferentKinds(right);

      case "value":
        return right.kind === "value"
          ? aliasSameValue(left, right)
          : aliasDifferentKinds(right);
    }
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
    const mayRead = effects.memory.reads.some((read) =>
      this.mayAlias(read, location),
    );
    const mayWrite = effects.memory.writes.some((write) =>
      this.mayAlias(write, location),
    );

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

function aliasDifferentKinds(location: MemoryLocation): AliasResult {
  return location.kind === "unknown" ? "may-alias" : "no-alias";
}

function aliasSameBinding(
  left: Extract<MemoryLocation, { kind: "binding" }>,
  right: Extract<MemoryLocation, { kind: "binding" }>,
): AliasResult {
  return left.declarationId === right.declarationId ? "must-alias" : "no-alias";
}

function aliasSameGlobal(
  left: Extract<MemoryLocation, { kind: "global" }>,
  right: Extract<MemoryLocation, { kind: "global" }>,
): AliasResult {
  return left.name === right.name ? "must-alias" : "no-alias";
}

function aliasSameValue(
  left: Extract<MemoryLocation, { kind: "value" }>,
  right: Extract<MemoryLocation, { kind: "value" }>,
): AliasResult {
  return left.valueId === right.valueId ? "must-alias" : "no-alias";
}

function aliasSameProperty(
  left: Extract<MemoryLocation, { kind: "property" }>,
  right: Extract<MemoryLocation, { kind: "property" }>,
): AliasResult {
  if (left.objectId !== right.objectId) return "may-alias";
  return propertyAlias(left.key, right.key);
}

function propertyAlias(
  left: PropertyLocationKey,
  right: PropertyLocationKey,
): AliasResult {
  if (left.kind === "unknown" || right.kind === "unknown") {
    return "may-alias";
  }

  return left.kind === right.kind && left.name === right.name
    ? "must-alias"
    : "no-alias";
}

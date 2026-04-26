import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { MemoryEffects } from "../../memory/MemoryLocation";

/**
 * Shared base for property loads. Two concrete variants live in
 * sibling files:
 *
 *   - {@link import("./LoadStaticProperty").LoadStaticPropertyOp} —
 *     `obj.foo`, `obj["literal"]`, numeric-literal keys folded to
 *     strings. Key is an attribute.
 *
 *   - {@link import("./LoadDynamicProperty").LoadDynamicPropertyOp} —
 *     `obj[expr]`. Key is a Value operand.
 *
 * Kept as separate classes so the TS type system enforces the
 * static-vs-dynamic operand shape. The base exists to make shared
 * semantics (side-effects, the `optional` attribute) impossible to
 * diverge between variants — not to unify codegen or operand
 * handling, which legitimately differ.
 */
export abstract class LoadPropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly optional: boolean,
  ) {
    super(id);
  }

  /**
   * Property reads can invoke getters, trigger Proxy traps, or throw
   * on null/undefined receivers. Memory-aware passes use
   * {@link getMemoryEffects} for the finer-grained reads annotation;
   * the five effect axes below capture the rest:
   *
   *   - `mayThrow=true` — null/undefined receiver, getter throw,
   *     Proxy trap throw. This is the axis that prevents
   *     `isDuplicable` from returning true (the getter-duplication
   *     hazard called out in `packages/compiler/CLAUDE.md`).
   *   - `mayDiverge=false` — accessor calls aren't modeled as loops.
   *   - `isDeterministic=true` — we don't model getter state
   *     mutations; the access yields the same value at the same
   *     program point.
   *   - `isObservable=false` — property reads don't print.
   *
   * V8 / Closure treat property reads as pure for optimization wins
   * at the cost of correctness when getters have observable effects.
   * For an AOT JS-to-JS target we prefer semantic preservation.
   */
  public abstract override getMemoryEffects(env?: unknown): MemoryEffects;

  public override mayThrow(): boolean {
    return true;
  }
  public override mayDiverge(): boolean {
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(): boolean {
    return false;
  }
}

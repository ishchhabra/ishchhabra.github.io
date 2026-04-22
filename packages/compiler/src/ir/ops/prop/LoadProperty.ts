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
   * on null/undefined receivers — all observable. We keep the default
   * `hasSideEffects(): true` so DCE won't silently drop orphan access
   * chains. Memory-aware passes (LICM, CSE over provably getter-free
   * bases) use {@link getMemoryEffects} for the finer-grained reads
   * annotation.
   *
   * V8 / Closure treat property reads as pure for optimization wins
   * at the cost of correctness when getters have observable effects.
   * For an AOT JS-to-JS target we prefer semantic preservation.
   */
  public abstract override getMemoryEffects(env?: unknown): MemoryEffects;
}

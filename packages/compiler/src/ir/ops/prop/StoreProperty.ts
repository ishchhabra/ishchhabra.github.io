import { OperationId } from "../../core";
import { Value } from "../../core";
import { Operation } from "../../core/Operation";
import type { MemoryEffects } from "../../memory/MemoryLocation";

/**
 * Shared base for property stores. Two concrete variants live in
 * sibling files:
 *
 *   - {@link import("./StoreStaticProperty").StoreStaticPropertyOp} —
 *     `obj.foo = v`, `obj["literal"] = v`, numeric-literal keys
 *     folded to strings. Key is an attribute.
 *
 *   - {@link import("./StoreDynamicProperty").StoreDynamicPropertyOp} —
 *     `obj[expr] = v`. Key is a Value operand.
 *
 * Kept as separate classes so the TS type system enforces the
 * static-vs-dynamic operand shape. The base ensures side-effect
 * semantics stay symmetric between variants.
 *
 * Property stores are always observably side-effectful: setters
 * (own or on the prototype chain), Proxy `set` traps, strict-mode
 * TypeErrors on non-writable / non-extensible / frozen targets,
 * and TypeErrors on null/undefined receivers. The five axes
 * below describe this:
 *
 *   - `getMemoryEffects` — writes the staticProperty/computedProperty
 *     location (overridden in subclasses).
 *   - `mayThrow=true` — null receiver, frozen target, setter throw.
 *   - `mayDiverge=false` — setter calls aren't modeled as loops.
 *   - `isDeterministic=true`.
 *   - `isObservable=false` — setter side effects manifest as memory
 *     writes (already captured); the store itself doesn't print.
 */
export abstract class StorePropertyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly object: Value,
    public readonly value: Value,
  ) {
    super(id);
  }

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

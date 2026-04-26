import {
  destructureTargetHasObservableWrites,
  destructureTargetResults,
  destructureTargetOperands,
  OperationId,
  rewriteDestructureTarget,
  type DestructureTarget,
  type Value,
} from "../../core";

import type { CloneContext } from "../../core/Operation";
import { Operation } from "../../core/Operation";
import {
  contextLocation,
  effects,
  localLocation,
  type MemoryEffects,
  type MemoryLocation,
} from "../../memory/MemoryLocation";
export class ArrayDestructureOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly elements: Array<DestructureTarget | null>,
    public readonly value: Value,
    public readonly kind: "declaration" | "assignment",
    public readonly declarationKind: "let" | "const" | "var" | null = null,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrayDestructureOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(
      ArrayDestructureOp,
      place,
      this.elements,
      this.value,
      this.kind,
      this.declarationKind,
    );
  }

  rewrite(
    values: Map<Value, Value>,
    { rewriteDefinitions = false }: { rewriteDefinitions?: boolean } = {},
  ): ArrayDestructureOp {
    return new ArrayDestructureOp(
      this.id,
      this.place,
      this.elements.map((element) =>
        element === null ? null : rewriteDestructureTarget(element, values, { rewriteDefinitions }),
      ),
      this.value.rewrite(values),
      this.kind,
      this.declarationKind,
    );
  }

  operands(): Value[] {
    return [this.value, ...destructureTargetOperands({ kind: "array", elements: this.elements })];
  }

  override results(): Value[] {
    return [this.place, ...destructureTargetResults({ kind: "array", elements: this.elements })];
  }

  // Five-axis effects:
  //  - getMemoryEffects: declares binding writes (used by memory
  //    analyses); the per-axis booleans below mirror the pre-five-
  //    axis behavior so DCE relies on the unused-result check to
  //    drop dead destructures (every binding result has zero
  //    users ⇒ removable).
  //  - mayThrow=false (preserves the old hasSideEffects=false
  //    decision for binding-only destructures).
  //  - mayDiverge=false. isDeterministic=true.
  //  - isObservable: only when the destructure tree contains
  //    member-target writes (setters / property writes are
  //    externally visible).
  public override mayThrow(): boolean {
    return false;
  }
  public override mayDiverge(): boolean {
    return false;
  }
  public override get isDeterministic(): boolean {
    return true;
  }
  public override isObservable(): boolean {
    return destructureTargetHasObservableWrites({ kind: "array", elements: this.elements });
  }

  /**
   * Per-binding write locations, exposed for memory-aware analyses
   * (e.g. {@link MemoryStateWalker}). Not used by the on-op
   * `getMemoryEffects` because that's queried by the DCE predicate
   * — and a dead binding-only destructure must remain removable.
   * Liveness is decided by the per-result `users.size` walk in
   * DCE; this helper exists so memory-walks can still consult the
   * actual writes when they want them.
   */
  public bindingWriteLocations(): MemoryLocation[] {
    const writes: MemoryLocation[] = [];
    collectDestructureBindingLocations({ kind: "array", elements: this.elements }, writes);
    return writes;
  }

  public override getMemoryEffects(_env?: unknown): MemoryEffects {
    return effects([], []);
  }

  public override print(): string {
    return `${this.place.print()} = array_destructure ${this.value.print()} {kind = ${this.kind}}`;
  }
}

/** Gather binding-target memory locations for a destructure tree. */
function collectDestructureBindingLocations(
  target: DestructureTarget,
  out: MemoryLocation[],
): void {
  switch (target.kind) {
    case "binding":
      if (target.storage === "local") out.push(localLocation(target.place.declarationId));
      else out.push(contextLocation(target.place.declarationId));
      return;
    case "static-member":
    case "dynamic-member":
      // Property writes are described via their composite position
      // in the destructure; we don't surface them as separate
      // writes here (future: lower to explicit StoreStaticProperty).
      return;
    case "assignment":
      collectDestructureBindingLocations(target.left, out);
      return;
    case "rest":
      collectDestructureBindingLocations(target.argument, out);
      return;
    case "array":
      for (const element of target.elements) {
        if (element !== null) collectDestructureBindingLocations(element, out);
      }
      return;
    case "object":
      for (const property of target.properties) {
        collectDestructureBindingLocations(property.value, out);
      }
      return;
  }
}

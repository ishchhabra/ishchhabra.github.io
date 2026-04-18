import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, Operation, remapPlace, Trait } from "../../core/Operation";

/**
 * Structured-op yield. The MLIR `scf.yield` analog: terminates a
 * block that sits at the end of a structured op's region, returning
 * zero or more values to the enclosing op. The enclosing op's
 * `resultPlaces` list binds positionally to the yielded values.
 *
 * YieldOp is a terminator but it does NOT name a CFG successor block:
 * control returns to the enclosing structured op's continuation
 * (i.e., the next op in the parent block). It is the textbook,
 * one-and-only way to complete a region normally.
 */
export class YieldOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public readonly values: readonly Value[],
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [...this.values];
  }

  rewrite(values: Map<Value, Value>): YieldOp {
    let changed = false;
    const out: Value[] = [];
    for (const v of this.values) {
      const next = values.get(v) ?? v;
      if (next !== v) changed = true;
      out.push(next);
    }
    if (!changed) return this;
    return new YieldOp(this.id, out);
  }

  clone(ctx: CloneContext): YieldOp {
    return new YieldOp(
      nextId(ctx),
      this.values.map((v) => remapPlace(ctx, v)),
    );
  }

  override remap(_from: BasicBlock, _to: BasicBlock): void {
    // YieldOp has no block refs.
  }

  override getBlockRefs(): BasicBlock[] {
    return [];
  }

  public override print(): string {
    if (this.values.length === 0) return "yield";
    return `yield ${this.values.map((p) => p.print()).join(", ")}`;
  }
}

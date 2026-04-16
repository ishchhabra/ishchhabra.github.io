import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, remapPlace, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

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
    public readonly values: readonly Place[],
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [...this.values];
  }

  rewrite(values: Map<Identifier, Place>): YieldOp {
    let changed = false;
    const out: Place[] = [];
    for (const v of this.values) {
      const next = values.get(v.identifier) ?? v;
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

  override remap(_from: BlockId, _to: BlockId): void {
    // YieldOp has no block refs.
  }

  override getBlockRefs(): BlockId[] {
    return [];
  }

  public override print(): string {
    if (this.values.length === 0) return "yield";
    return `yield ${this.values.map((p) => p.print()).join(", ")}`;
  }
}

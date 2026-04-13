import type { OperationId } from "../../core";
import type { BlockId } from "../../core/Block";
import type { Identifier } from "../../core/Identifier";
import { type CloneContext, nextId, Operation, remapBlockId, Trait } from "../../core/Operation";
import type { Place } from "../../core/Place";

/**
 * Unconditional jump to a successor block. Terminator. Replaces
 * `JumpTerminal`.
 */
export class JumpOp extends Operation {
  static override readonly traits = new Set<Trait>([Trait.Terminator]);

  constructor(
    id: OperationId,
    public target: BlockId,
  ) {
    super(id);
  }

  getOperands(): Place[] {
    return [];
  }

  rewrite(_values: Map<Identifier, Place>): JumpOp {
    return this;
  }

  clone(ctx: CloneContext): JumpOp {
    return new JumpOp(nextId(ctx), remapBlockId(ctx, this.target));
  }

  override remap(from: BlockId, to: BlockId): void {
    if (this.target === from) this.target = to;
  }

  override getBlockRefs(): BlockId[] {
    return [this.target];
  }

  public override print(): string {
    return `jump bb${this.target}`;
  }
}

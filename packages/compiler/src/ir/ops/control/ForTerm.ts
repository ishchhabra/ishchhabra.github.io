import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, TermOp } from "../../core/Operation";

/**
 * C-style for-loop header terminator.
 *
 * The init section is lowered in the predecessor block. The block
 * hosting this terminator is an empty landing pad; the test lives in
 * `testBlock`, terminated by a {@link BranchTermOp} whose
 * `trueTarget = bodyBlock` and `falseTarget = exitBlock`. The body
 * ends with a jump to `updateBlock`, which evaluates the update clause
 * and then jumps back to the host block.
 *
 * Break / continue: break → `exitBlock`, continue → `updateBlock`
 * (which runs the update then re-tests).
 */
export class ForTermOp extends TermOp {
  constructor(
    id: OperationId,
    public testBlock: BasicBlock,
    public bodyBlock: BasicBlock,
    public updateBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [];
  }

  getBlockRefs(): BasicBlock[] {
    // Only the real CFG successor. `bodyBlock` / `updateBlock` /
    // `exitBlock` are reached via the testBlock's BranchTermOp or
    // back-edge jumps, not directly by this terminator.
    return [this.testBlock];
  }

  rewrite(_values: Map<Value, Value>): ForTermOp {
    return this;
  }

  clone(ctx: CloneContext): ForTermOp {
    return new ForTermOp(
      nextId(ctx),
      ctx.blockMap.get(this.testBlock) ?? this.testBlock,
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.updateBlock) ?? this.updateBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.label,
    );
  }
}

import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId } from "../../core/Operation";
import {
  assertNoTargetArgs,
  type BlockTarget,
  invalidTargetIndex,
  TermOp,
} from "../../core/TermOp";

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

  operands(): Value[] {
    return [];
  }

  targetCount(): number {
    return 1;
  }

  target(index: number): BlockTarget {
    if (index === 0) return { block: this.testBlock, args: [] };
    return invalidTargetIndex(this.constructor.name, index);
  }

  withTarget(index: number, successor: BlockTarget): ForTermOp {
    assertNoTargetArgs(this.constructor.name, successor);
    if (index !== 0) return invalidTargetIndex(this.constructor.name, index);
    return new ForTermOp(
      this.id,
      successor.block,
      this.bodyBlock,
      this.updateBlock,
      this.exitBlock,
      this.label,
    );
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

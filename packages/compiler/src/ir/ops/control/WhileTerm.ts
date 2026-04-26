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
 * Loop header for `while (cond) body` and `do body while (cond)`.
 *
 * The block hosting this terminator is an empty landing pad (the
 * `continue` target). Condition evaluation lives in `testBlock`,
 * which is terminated by a {@link BranchTermOp} whose
 * `trueTarget = bodyBlock` and `falseTarget = exitBlock`.
 *
 * Flow:
 *   - `while`:  parent → hostBlock → testBlock → body?/exit; body → hostBlock
 *   - `do-while`: parent → body → hostBlock → testBlock → body?/exit
 *
 * Loop-carried values flow through block parameters on the host
 * block (standard CFG SSA).
 */
export class WhileTermOp extends TermOp {
  constructor(
    id: OperationId,
    public testBlock: BasicBlock,
    public bodyBlock: BasicBlock,
    public exitBlock: BasicBlock,
    public readonly kind: "while" | "do-while",
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
    if (index === 0) {
      const target = this.kind === "do-while" ? this.bodyBlock : this.testBlock;
      return { block: target, args: [] };
    }
    return invalidTargetIndex(this.constructor.name, index);
  }

  withTarget(index: number, successor: BlockTarget): WhileTermOp {
    assertNoTargetArgs(this.constructor.name, successor);
    if (index !== 0) return invalidTargetIndex(this.constructor.name, index);
    if (this.kind === "do-while") {
      return new WhileTermOp(
        this.id,
        this.testBlock,
        successor.block,
        this.exitBlock,
        this.kind,
        this.label,
      );
    }
    return new WhileTermOp(
      this.id,
      successor.block,
      this.bodyBlock,
      this.exitBlock,
      this.kind,
      this.label,
    );
  }

  rewrite(_values: Map<Value, Value>): WhileTermOp {
    return this;
  }

  clone(ctx: CloneContext): WhileTermOp {
    return new WhileTermOp(
      nextId(ctx),
      ctx.blockMap.get(this.testBlock) ?? this.testBlock,
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.exitBlock) ?? this.exitBlock,
      this.kind,
      this.label,
    );
  }
}

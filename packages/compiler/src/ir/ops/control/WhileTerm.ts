import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, TermOp } from "../../core/Operation";

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

  getOperands(): Value[] {
    return [];
  }

  getBlockRefs(): BasicBlock[] {
    // Only the real CFG successor. `bodyBlock` / `exitBlock` are
    // reached via the testBlock's BranchTermOp, not directly by this
    // terminator. Including them would distort predecessor analysis
    // (body/exit would see hostBlock as a phantom predecessor,
    // producing spurious phi placements).
    return [this.testBlock];
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

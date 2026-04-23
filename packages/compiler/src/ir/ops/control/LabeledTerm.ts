import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, TermOp } from "../../core/Operation";

/**
 * Labeled block entry. Supports labeled `break` / `continue` across
 * nested constructs.
 *
 *   label: { body } fallthrough
 *
 * Control enters `bodyBlock`. A `BreakOp` with `target = this label`
 * jumps to `fallthroughBlock`; a `ContinueOp` with `target = this
 * label` jumps back to this terminator (rare — typically continue
 * is handled by inner loops, not labeled blocks).
 */
export class LabeledTermOp extends TermOp {
  constructor(
    id: OperationId,
    public bodyBlock: BasicBlock,
    public fallthroughBlock: BasicBlock,
    public readonly label: string,
  ) {
    super(id);
  }

  getOperands(): Value[] {
    return [];
  }

  getBlockRefs(): BasicBlock[] {
    return [this.bodyBlock, this.fallthroughBlock];
  }

  rewrite(_values: Map<Value, Value>): LabeledTermOp {
    return this;
  }

  clone(ctx: CloneContext): LabeledTermOp {
    return new LabeledTermOp(
      nextId(ctx),
      ctx.blockMap.get(this.bodyBlock) ?? this.bodyBlock,
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
      this.label,
    );
  }
}

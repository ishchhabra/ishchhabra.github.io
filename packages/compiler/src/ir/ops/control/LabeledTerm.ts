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

  operands(): Value[] {
    return [];
  }

  targetCount(): number {
    return 2;
  }

  target(index: number): BlockTarget {
    if (index === 0) return { block: this.bodyBlock, args: [] };
    if (index === 1) return { block: this.fallthroughBlock, args: [] };
    return invalidTargetIndex(this.constructor.name, index);
  }

  override successorIndices(): readonly number[] {
    return [0];
  }

  withTarget(index: number, successor: BlockTarget): LabeledTermOp {
    assertNoTargetArgs(this.constructor.name, successor);
    if (index === 0) {
      return new LabeledTermOp(this.id, successor.block, this.fallthroughBlock, this.label);
    }
    if (index === 1) {
      return new LabeledTermOp(this.id, this.bodyBlock, successor.block, this.label);
    }
    return invalidTargetIndex(this.constructor.name, index);
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

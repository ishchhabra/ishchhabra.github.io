import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace, TermOp } from "../../core/Operation";

export interface SwitchCase {
  readonly test: Value;
  readonly block: BasicBlock;
}

export class SwitchTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly discriminant: Value,
    public cases: readonly SwitchCase[],
    public defaultBlock: BasicBlock,
    public fallthroughBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id);
  }

  operands(): Value[] {
    return [this.discriminant, ...this.cases.map((c) => c.test)];
  }

  getBlockRefs(): BasicBlock[] {
    return [...this.cases.map((c) => c.block), this.defaultBlock, this.fallthroughBlock];
  }

  rewrite(values: Map<Value, Value>): SwitchTermOp {
    const newDisc = values.get(this.discriminant) ?? this.discriminant;
    let changed = newDisc !== this.discriminant;
    const newCases = this.cases.map((c) => {
      const newTest = values.get(c.test) ?? c.test;
      if (newTest !== c.test) changed = true;
      return { test: newTest, block: c.block };
    });
    if (!changed) return this;
    return new SwitchTermOp(
      this.id,
      newDisc,
      newCases,
      this.defaultBlock,
      this.fallthroughBlock,
      this.label,
    );
  }

  clone(ctx: CloneContext): SwitchTermOp {
    return new SwitchTermOp(
      nextId(ctx),
      remapPlace(ctx, this.discriminant),
      this.cases.map((c) => ({
        test: remapPlace(ctx, c.test),
        block: ctx.blockMap.get(c.block) ?? c.block,
      })),
      ctx.blockMap.get(this.defaultBlock) ?? this.defaultBlock,
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
      this.label,
    );
  }
}

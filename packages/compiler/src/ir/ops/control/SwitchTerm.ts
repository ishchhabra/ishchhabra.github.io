import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  assertNoTargetArgs,
  type ControlFlowFacts,
  type BlockTarget,
  invalidTargetIndex,
  TermOp,
} from "../../core/TermOp";

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

  targetCount(): number {
    return this.cases.length + 2;
  }

  target(index: number): BlockTarget {
    if (index >= 0 && index < this.cases.length)
      return { block: this.cases[index].block, args: [] };
    if (index === this.cases.length) return { block: this.defaultBlock, args: [] };
    if (index === this.cases.length + 1) return { block: this.fallthroughBlock, args: [] };
    return invalidTargetIndex(this.constructor.name, index);
  }

  override successorIndices(): readonly number[] {
    return Array.from({ length: this.cases.length + 1 }, (_, i) => i);
  }

  override takenSuccessorIndices(facts: ControlFlowFacts): readonly number[] {
    for (let i = 0; i < this.cases.length; i++) {
      const equality = facts.strictEqual(this.discriminant, this.cases[i].test);
      if (equality === "pending") return [];
      if (equality === "unknown") return this.successorIndices();
      if (equality) return [i];
    }
    return [this.cases.length];
  }

  withTarget(index: number, successor: BlockTarget): SwitchTermOp {
    assertNoTargetArgs(this.constructor.name, successor);
    if (index >= 0 && index < this.cases.length) {
      const cases = this.cases.map((switchCase, caseIndex) =>
        caseIndex === index ? { ...switchCase, block: successor.block } : switchCase,
      );
      return new SwitchTermOp(
        this.id,
        this.discriminant,
        cases,
        this.defaultBlock,
        this.fallthroughBlock,
        this.label,
      );
    }
    if (index === this.cases.length) {
      return new SwitchTermOp(
        this.id,
        this.discriminant,
        this.cases,
        successor.block,
        this.fallthroughBlock,
        this.label,
      );
    }
    if (index === this.cases.length + 1) {
      return new SwitchTermOp(
        this.id,
        this.discriminant,
        this.cases,
        this.defaultBlock,
        successor.block,
        this.label,
      );
    }
    return invalidTargetIndex(this.constructor.name, index);
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

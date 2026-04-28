import type { OperationId } from "../../core";
import type { BasicBlock } from "../../core/Block";
import type { Value } from "../../core/Value";
import { type CloneContext, nextId, remapPlace } from "../../core/Operation";
import {
  assertNoTargetArgs,
  type ControlFlowFacts,
  type BlockTarget,
  invalidTargetIndex,
  type SuccessorArg,
  TermOp,
} from "../../core/TermOp";

export interface SwitchCase {
  readonly test: Value;
  readonly target: BlockTarget;
}

export class SwitchTermOp extends TermOp {
  constructor(
    id: OperationId,
    public readonly discriminant: Value,
    public cases: readonly SwitchCase[],
    public defaultTarget: BlockTarget,
    public fallthroughBlock: BasicBlock,
    public readonly label?: string,
  ) {
    super(id);
  }

  get defaultBlock(): BasicBlock {
    return this.defaultTarget.block;
  }

  operands(): Value[] {
    return [this.discriminant, ...this.cases.map((c) => c.test)];
  }

  targetCount(): number {
    return this.cases.length + 2;
  }

  target(index: number): BlockTarget {
    if (index >= 0 && index < this.cases.length) return this.cases[index].target;
    if (index === this.cases.length) return this.defaultTarget;
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
    if (index >= 0 && index < this.cases.length) {
      const cases = this.cases.map((switchCase, caseIndex) =>
        caseIndex === index ? { ...switchCase, target: successor } : switchCase,
      );
      return new SwitchTermOp(
        this.id,
        this.discriminant,
        cases,
        this.defaultTarget,
        this.fallthroughBlock,
        this.label,
      );
    }
    if (index === this.cases.length) {
      return new SwitchTermOp(
        this.id,
        this.discriminant,
        this.cases,
        successor,
        this.fallthroughBlock,
        this.label,
      );
    }
    if (index === this.cases.length + 1) {
      assertNoTargetArgs(this.constructor.name, successor);
      return new SwitchTermOp(
        this.id,
        this.discriminant,
        this.cases,
        this.defaultTarget,
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
      const newArgs = rewriteSuccessorArgs(c.target.args, values, () => {
        changed = true;
      });
      return { test: newTest, target: { block: c.target.block, args: newArgs } };
    });
    const newDefaultArgs = rewriteSuccessorArgs(this.defaultTarget.args, values, () => {
      changed = true;
    });
    if (!changed) return this;
    return new SwitchTermOp(
      this.id,
      newDisc,
      newCases,
      { block: this.defaultBlock, args: newDefaultArgs },
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
        target: cloneTarget(ctx, c.target),
      })),
      cloneTarget(ctx, this.defaultTarget),
      ctx.blockMap.get(this.fallthroughBlock) ?? this.fallthroughBlock,
      this.label,
    );
  }
}

function rewriteSuccessorArgs(
  args: readonly SuccessorArg[],
  values: Map<Value, Value>,
  onChanged: () => void,
): SuccessorArg[] {
  return args.map((arg) => {
    const rewritten = values.get(arg.value) ?? arg.value;
    if (rewritten === arg.value) return arg;
    onChanged();
    return { ...arg, value: rewritten };
  });
}

function cloneTarget(ctx: CloneContext, target: BlockTarget): BlockTarget {
  return {
    block: ctx.blockMap.get(target.block) ?? target.block,
    args: target.args.map((arg) => ({
      ...arg,
      value: ctx.valueMap.get(arg.value) ?? arg.value,
    })),
  };
}

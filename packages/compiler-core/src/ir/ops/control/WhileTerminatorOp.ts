import { BasicBlock } from "../../core/Block";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  BlockTarget,
  cloneBlockTarget,
  replaceForwardedOperands,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

export type WhileTerminatorKind = "while" | "do-while";

/**
 * Structured loop terminator for `while` and `do-while` statements.
 *
 * The terminator preserves source-level loop structure while still using
 * ordinary basic blocks for the test, body, and exit regions. Codegen can emit
 * a structured JavaScript loop directly, while analyses still see explicit CFG
 * successors.
 */
export class WhileTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly testTarget: BlockTarget,
    public readonly bodyTarget: BlockTarget,
    public readonly exitTarget: BlockTarget,
    public readonly kind: WhileTerminatorKind,
    public readonly label: string | null = null,
  ) {
    super(id);
  }

  public get testBlock(): BasicBlock {
    return this.testTarget.block;
  }

  public get bodyBlock(): BasicBlock {
    return this.bodyTarget.block;
  }

  public get exitBlock(): BasicBlock {
    return this.exitTarget.block;
  }

  public override operands(): readonly Value[] {
    return [
      ...this.testTarget.operands.forwarded,
      ...this.bodyTarget.operands.forwarded,
      ...this.exitTarget.operands.forwarded,
    ];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): WhileTerminatorOp {
    const testCount = this.testTarget.operands.forwarded.length;
    const bodyCount = this.bodyTarget.operands.forwarded.length;
    const exitCount = this.exitTarget.operands.forwarded.length;
    const expected = testCount + bodyCount + exitCount;

    if (operands.length !== expected) {
      throw new Error(
        `WhileTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const testTarget = replaceForwardedOperands(this.testTarget, operands.slice(0, testCount));
    const bodyTarget = replaceForwardedOperands(
      this.bodyTarget,
      operands.slice(testCount, testCount + bodyCount),
    );
    const exitTarget = replaceForwardedOperands(
      this.exitTarget,
      operands.slice(testCount + bodyCount),
    );

    if (
      testTarget === this.testTarget &&
      bodyTarget === this.bodyTarget &&
      exitTarget === this.exitTarget
    ) {
      return this;
    }

    return new WhileTerminatorOp(
      this.id,
      testTarget,
      bodyTarget,
      exitTarget,
      this.kind,
      this.label,
    );
  }

  public override clone(context: OperationCloneContext): WhileTerminatorOp {
    return new WhileTerminatorOp(
      context.ids.operationId(),
      cloneBlockTarget(context, this.testTarget),
      cloneBlockTarget(context, this.bodyTarget),
      cloneBlockTarget(context, this.exitTarget),
      this.kind,
      this.label,
    );
  }

  public override targetCount(): number {
    return 3;
  }

  public override target(index: number): BlockTarget {
    if (index === 0) return this.testTarget;
    if (index === 1) return this.bodyTarget;
    if (index === 2) return this.exitTarget;

    throw new Error(`WhileTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): WhileTerminatorOp {
    if (index === 0) {
      return new WhileTerminatorOp(
        this.id,
        target,
        this.bodyTarget,
        this.exitTarget,
        this.kind,
        this.label,
      );
    }

    if (index === 1) {
      return new WhileTerminatorOp(
        this.id,
        this.testTarget,
        target,
        this.exitTarget,
        this.kind,
        this.label,
      );
    }

    if (index === 2) {
      return new WhileTerminatorOp(
        this.id,
        this.testTarget,
        this.bodyTarget,
        target,
        this.kind,
        this.label,
      );
    }

    throw new Error(`WhileTerminatorOp#${this.id} has no target ${index}`);
  }

  public override successorIndices(): readonly number[] {
    return this.kind === "do-while" ? [1] : [0];
  }
}

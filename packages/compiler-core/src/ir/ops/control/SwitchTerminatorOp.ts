import { BasicBlock } from "../../core/Block";
import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import {
  BlockTarget,
  cloneBlockTarget,
  replaceSuccessorValues,
  successorValues,
  TerminatorOp,
} from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, PureOperationEffects } from "../../effects";

export interface SwitchCaseTarget {
  readonly test: Value | null;
  readonly target: BlockTarget;
}

/**
 * Transfers control to the first matching switch case.
 *
 * Cases are stored in source order. A null test represents `default:`.
 * Fallthrough between case bodies is represented by ordinary jumps.
 */
export class SwitchTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly discriminant: Value,
    public readonly cases: readonly SwitchCaseTarget[],
    public readonly completionBlock: BasicBlock,
    public readonly label: string | null = null,
  ) {
    super(id);
  }

  public override operands(): readonly Value[] {
    return [
      this.discriminant,
      ...this.cases.flatMap((c) => [
        ...(c.test === null ? [] : [c.test]),
        ...successorValues(c.target),
      ]),
    ];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): SwitchTerminatorOp {
    const expected = this.operands().length;

    if (operands.length !== expected) {
      throw new Error(
        `SwitchTerminatorOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [discriminant, ...caseOperands] = operands;
    let operandIndex = 0;

    const cases = this.cases.map((switchCase) => {
      const test = switchCase.test === null ? null : caseOperands[operandIndex++];

      const targetValues = successorValues(switchCase.target);
      const target = replaceSuccessorValues(
        switchCase.target,
        caseOperands.slice(operandIndex, operandIndex + targetValues.length),
      );
      operandIndex += targetValues.length;

      if (test === switchCase.test && target === switchCase.target) {
        return switchCase;
      }

      return { test, target };
    });

    if (operandIndex !== caseOperands.length) {
      throw new Error(`SwitchTerminatorOp#${this.id} received unused successor operands`);
    }

    if (
      discriminant === this.discriminant &&
      cases.every((switchCase, index) => switchCase === this.cases[index])
    ) {
      return this;
    }

    return new SwitchTerminatorOp(this.id, discriminant, cases, this.completionBlock, this.label);
  }

  public override clone(context: OperationCloneContext): SwitchTerminatorOp {
    return new SwitchTerminatorOp(
      context.ids.operationId(),
      context.value(this.discriminant),
      this.cases.map((switchCase) => ({
        test: switchCase.test === null ? null : context.value(switchCase.test),
        target: cloneBlockTarget(context, switchCase.target),
      })),
      context.block(this.completionBlock),
      this.label,
    );
  }

  public override targetCount(): number {
    return this.cases.length;
  }

  public override target(index: number): BlockTarget {
    if (index >= 0 && index < this.cases.length) {
      return this.cases[index].target;
    }

    throw new Error(`SwitchTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, target: BlockTarget): SwitchTerminatorOp {
    if (index >= 0 && index < this.cases.length) {
      return new SwitchTerminatorOp(
        this.id,
        this.discriminant,
        this.cases.map((switchCase, caseIndex) =>
          caseIndex === index ? { ...switchCase, target } : switchCase,
        ),
        this.completionBlock,
        this.label,
      );
    }

    throw new Error(`SwitchTerminatorOp#${this.id} has no target ${index}`);
  }
}

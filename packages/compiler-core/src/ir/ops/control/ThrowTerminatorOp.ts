import { OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import { BlockTarget, TerminatorOp } from "../../core/TerminatorOp";
import { Value } from "../../core/Value";
import { OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Throws an exception value from the current function.
 *
 * The JavaScript backend emits this as `throw value;`. Structured try/catch
 * codegen relies on the JavaScript runtime to route the exception to the nearest
 * active catch handler.
 */
export class ThrowTerminatorOp extends TerminatorOp {
  constructor(
    id: OperationId,
    public readonly value: Value,
  ) {
    super(id);
  }

  public override operands(): readonly Value[] {
    return [this.value];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): ThrowTerminatorOp {
    if (operands.length !== 1) {
      throw new Error(`ThrowTerminatorOp#${this.id} expected 1 operand, got ${operands.length}`);
    }

    const [value] = operands;
    if (value === this.value) return this;

    return new ThrowTerminatorOp(this.id, value);
  }

  public override clone(context: OperationCloneContext): ThrowTerminatorOp {
    return new ThrowTerminatorOp(context.ids.operationId(), context.value(this.value));
  }

  public override targetCount(): number {
    return 0;
  }

  public override target(index: number): BlockTarget {
    throw new Error(`ThrowTerminatorOp#${this.id} has no target ${index}`);
  }

  public override withTarget(index: number, _target: BlockTarget): TerminatorOp {
    throw new Error(`ThrowTerminatorOp#${this.id} has no target ${index}`);
  }
}

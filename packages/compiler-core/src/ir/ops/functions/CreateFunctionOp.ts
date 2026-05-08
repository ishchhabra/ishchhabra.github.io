import type { FunctionIR } from "../../core/FunctionIR";
import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, PureOperationEffects } from "../../effects";

/**
 * Creates a JavaScript function object from a lowered function body.
 *
 * Function declarations, function expressions, and arrow functions all lower to
 * this operation. Binding writes, declaration hoisting, and assignment are
 * modeled by separate binding operations.
 */
export class CreateFunctionOp extends Operation {
  constructor(
    id: OperationId,
    public readonly functionIR: FunctionIR,
    public readonly captures: readonly Value[],
    result: Value,
  ) {
    super(id, [result]);
  }

  /**
   * Runtime values captured by the created function object.
   */
  public override operands(): readonly Value[] {
    return this.captures;
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): CreateFunctionOp {
    if (operands.length !== this.captures.length) {
      throw new Error(
        `CreateFunctionOp#${this.id} expected ${this.captures.length} operands, got ${operands.length}`,
      );
    }

    if (operands.every((operand, index) => operand === this.captures[index])) {
      return this;
    }

    return new CreateFunctionOp(this.id, this.functionIR, operands, this.result);
  }

  public override clone(context: OperationCloneContext): CreateFunctionOp {
    return new CreateFunctionOp(
      context.ids.operationId(),
      this.functionIR,
      this.captures.map((capture) => context.value(capture)),
      context.result(this.result),
    );
  }
}

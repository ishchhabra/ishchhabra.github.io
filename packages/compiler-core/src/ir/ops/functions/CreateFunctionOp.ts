import type { FunctionIR } from "../../core/FunctionIR";
import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { DeclarationId, Value } from "../../core/Value";
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
    result: Value,
  ) {
    super(id, [result]);
  }

  /**
   * Source declarations captured by the created function object.
   */
  public get captures(): readonly DeclarationId[] {
    return this.functionIR.params.flatMap((param) =>
      param.kind === "capture" ? [param.declarationId] : [],
    );
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return PureOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): CreateFunctionOp {
    if (operands.length !== 0) {
      throw new Error(
        `CreateFunctionOp#${this.id} expected 0 operands, got ${operands.length}`,
      );
    }

    return this;
  }

  public override clone(context: OperationCloneContext): CreateFunctionOp {
    return new CreateFunctionOp(
      context.ids.operationId(),
      this.functionIR,
      context.result(this.result),
    );
  }
}

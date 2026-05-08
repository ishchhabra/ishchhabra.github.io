import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { DeclarationId, Value } from "../../core/Value";
import { bindingMemoryLocation, type OperationEffects } from "../../effects";

/**
 * Initializes a declaration-backed binding with its first runtime value.
 *
 * `InitializeBindingOp` models declaration initialization, not later assignment.
 * It transitions a binding from its uninitialized state to an initialized state
 * and writes the initial value into declaration storage.
 */
export class InitializeBindingOp extends Operation {
  constructor(
    id: OperationId,
    public readonly declarationId: DeclarationId,
    public readonly value: Value,
    bindingValue: Value,
  ) {
    super(id, [bindingValue]);
  }

  /**
   * SSA value representing the declaration's runtime value after initialization.
   *
   * This is compiler-only dataflow, not a JavaScript expression result.
   *
   * @example
   * ```txt
   * v0 = ConstantOp(1)
   * x0 = InitializeBindingOp(x, v0)
   *
   * // x0 is the bindingValue; v0 is the runtime value stored in x.
   * ```
   */
  public get bindingValue(): Value {
    return this.result;
  }

  public override operands(): readonly Value[] {
    return [this.value];
  }

  public override effects(): OperationEffects {
    return {
      memory: {
        reads: [],
        writes: [bindingMemoryLocation(this.declarationId)],
      },
      mayThrow: true,
      mayDiverge: false,
      isObservable: true,
    };
  }

  public override withOperands(
    operands: readonly Value[],
  ): InitializeBindingOp {
    if (operands.length !== 1) {
      throw new Error(
        `InitializeBindingOp#${this.id} expected 1 operand, got ${operands.length}`,
      );
    }

    const [value] = operands;
    if (value === this.value) return this;

    return new InitializeBindingOp(
      this.id,
      this.declarationId,
      value,
      this.bindingValue,
    );
  }

  public override clone(context: OperationCloneContext): InitializeBindingOp {
    return new InitializeBindingOp(
      context.ids.operationId(),
      this.declarationId,
      context.value(this.value),
      context.result(this.bindingValue),
    );
  }
}

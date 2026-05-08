import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { DeclarationId, Value } from "../../core/Value";
import { bindingMemoryLocation, type OperationEffects } from "../../effects";

/**
 * Assigns a new value to an initialized declaration-backed binding.
 *
 * `StoreBindingOp` models runtime assignment to binding storage. Declaration
 * initialization is modeled separately by `InitializeBindingOp`.
 */
export class StoreBindingOp extends Operation {
  constructor(
    id: OperationId,
    public readonly declarationId: DeclarationId,
    public readonly value: Value,
    bindingValue: Value,
  ) {
    super(id, [bindingValue]);
  }

  /**
   * SSA value representing the declaration's runtime value after this write.
   *
   * This is compiler-only dataflow, not the JavaScript assignment expression
   * result. Assignment expressions evaluate to the RHS or computed value; this
   * value exists so SSA construction can connect later binding reads to the
   * write that reaches them.
   *
   * @example
   * ```txt
   * v0 = ConstantOp(1)
   * x0 = StoreBindingOp(x, v0)
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

  public override withOperands(operands: readonly Value[]): StoreBindingOp {
    if (operands.length !== 1) {
      throw new Error(
        `StoreBindingOp#${this.id} expected 1 operand, got ${operands.length}`,
      );
    }

    const [value] = operands;
    if (value === this.value) return this;

    return new StoreBindingOp(
      this.id,
      this.declarationId,
      value,
      this.bindingValue,
    );
  }

  public override clone(context: OperationCloneContext): StoreBindingOp {
    return new StoreBindingOp(
      context.ids.operationId(),
      this.declarationId,
      context.value(this.value),
      context.result(this.bindingValue),
    );
  }
}

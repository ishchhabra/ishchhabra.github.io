import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { DeclarationId, Value } from "../../core/Value";
import { bindingMemoryLocation, type OperationEffects } from "../../effects";

/**
 * Reads the current value of a declaration-backed binding.
 *
 * Before SSA construction, the load identifies only the source declaration
 * being read. After SSA construction, `bindingValue` identifies the reaching
 * binding value for that read.
 */
export class LoadBindingOp extends Operation {
  constructor(
    id: OperationId,
    public readonly declarationId: DeclarationId,
    result: Value,
    public readonly bindingValue: Value | null = null,
  ) {
    super(id, [result]);
  }

  /**
   * Whether SSA construction has resolved this load to a reaching binding value.
   */
  public get isResolved(): boolean {
    return this.bindingValue !== null;
  }

  public override operands(): readonly Value[] {
    return this.bindingValue === null ? [] : [this.bindingValue];
  }

  public override effects(): OperationEffects {
    return {
      memory: {
        reads: [bindingMemoryLocation(this.declarationId)],
        writes: [],
      },
      mayThrow: true,
      mayDiverge: false,
      isObservable: false,
    };
  }

  public override withOperands(operands: readonly Value[]): LoadBindingOp {
    if (this.bindingValue === null) {
      if (operands.length !== 0) {
        throw new Error(`LoadBindingOp#${this.id} is not SSA-resolved`);
      }

      return this;
    }

    if (operands.length !== 1) {
      throw new Error(`LoadBindingOp#${this.id} expected 1 operand, got ${operands.length}`);
    }

    const [bindingValue] = operands;
    if (bindingValue === this.bindingValue) return this;

    return new LoadBindingOp(this.id, this.declarationId, this.result, bindingValue);
  }

  public override clone(context: OperationCloneContext): LoadBindingOp {
    return new LoadBindingOp(
      context.ids.operationId(),
      this.declarationId,
      context.result(this.result),
      this.bindingValue === null ? null : context.value(this.bindingValue),
    );
  }
}

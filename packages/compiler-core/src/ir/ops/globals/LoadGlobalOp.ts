import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { globalMemoryLocation, UnknownMemoryLocation, type OperationEffects } from "../../effects";

/**
 * Reads a host/global binding by name.
 *
 * This is used for unresolved source references such as `console` or `foo`.
 * It is separate from `LoadBindingOp`, which reads declaration-backed source
 * bindings discovered by scope analysis.
 */
export class LoadGlobalOp extends Operation {
  constructor(
    id: OperationId,
    public readonly name: string,
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return [];
  }

  public override effects(): OperationEffects {
    return {
      memory: {
        reads: [UnknownMemoryLocation, globalMemoryLocation(this.name)],
        writes: [UnknownMemoryLocation],
      },
      mayThrow: true,
      mayDiverge: true,
      isObservable: true,
    };
  }

  public override clone(context: OperationCloneContext): LoadGlobalOp {
    return new LoadGlobalOp(context.ids.operationId(), this.name, context.result(this.result));
  }
}

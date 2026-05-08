import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Emits an ordered default export of a runtime value.
 *
 * The module's public surface is still recorded on `ModuleIR`. This operation
 * anchors the source-level `export default <expression>` statement in the
 * module body so the exported expression is evaluated in the correct order.
 *
 * @example
 * ```js
 * export default foo();
 * export default function () {}
 * export default class {}
 * ```
 */
export class ExportDefaultValueOp extends Operation {
  public constructor(
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

  public override withOperands(operands: readonly Value[]): ExportDefaultValueOp {
    if (operands.length !== 1) {
      throw new Error(`ExportDefaultValueOp#${this.id} expected 1 operand, got ${operands.length}`);
    }

    return operands[0] === this.value ? this : new ExportDefaultValueOp(this.id, operands[0]);
  }

  public override clone(context: OperationCloneContext): ExportDefaultValueOp {
    return new ExportDefaultValueOp(context.ids.operationId(), context.value(this.value));
  }
}

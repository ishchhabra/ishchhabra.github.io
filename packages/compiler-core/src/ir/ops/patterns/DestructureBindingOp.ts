import {
  bindingPatternBindings,
  bindingPatternOperands,
  BindingPatternTarget,
  BindingWriteMode,
  cloneBindingPatternTarget,
  rewriteBindingPatternOperands,
} from "../../core/DestructurePattern";
import { Operation, OperationId } from "../../core/Operation";
import { OperationCloneContext } from "../../core/OperationCloneContext";
import { Value } from "../../core/Value";
import { OperationEffects, UnknownOperationEffects } from "../../effects";

/**
 * Runs ECMAScript binding-pattern destructuring from a source value.
 *
 * This high-level op preserves destructuring for clean JavaScript codegen.
 * Lower it before low-level SSA optimization.
 *
 * @example Lexical binding
 * ```js
 * const { x } = obj;
 * ```
 * Emits `DestructureBindingOp` with mode `"initialize"`.
 *
 * @example Var binding
 * ```js
 * var { x } = obj;
 * ```
 * Emits `DestructureBindingOp` with mode `"store"`.
 */
export class DestructureBindingOp extends Operation {
  constructor(
    id: OperationId,
    public readonly target: BindingPatternTarget,
    public readonly source: Value,
    public readonly mode: BindingWriteMode,
  ) {
    super(
      id,
      bindingPatternBindings(target).map((binding) => binding.bindingValue),
    );
  }

  public override operands(): readonly Value[] {
    return [this.source, ...bindingPatternOperands(this.target)];
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): DestructureBindingOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `DestructureBindingOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    const [source, ...targetOperands] = operands;

    return new DestructureBindingOp(
      this.id,
      rewriteBindingPatternOperands(this.target, targetOperands),
      source,
      this.mode,
    );
  }

  public override clone(context: OperationCloneContext): DestructureBindingOp {
    return new DestructureBindingOp(
      context.ids.operationId(),
      cloneBindingPatternTarget(context, this.target),
      context.value(this.source),
      this.mode,
    );
  }
}

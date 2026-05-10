import { Operation, type OperationId } from "../../core/Operation";
import type { OperationCloneContext } from "../../core/OperationCloneContext";
import type { Value } from "../../core/Value";
import { type OperationEffects, UnknownOperationEffects } from "../../effects";
import { childOperands, cloneChild, mapChildOperands, type JSXChild } from "./JSXElementOp";

/**
 * Creates a JSX fragment value.
 *
 * Fragments preserve source-level JSX structure without introducing a synthetic
 * tag name.
 *
 * @example
 * ```jsx
 * <>
 *   <Header />
 *   <main>{children}</main>
 * </>
 * ```
 */
export class JSXFragmentOp extends Operation {
  public constructor(
    id: OperationId,
    public readonly children: readonly JSXChild[],
    result: Value,
  ) {
    super(id, [result]);
  }

  public override operands(): readonly Value[] {
    return this.children.flatMap(childOperands);
  }

  public override effects(): OperationEffects {
    return UnknownOperationEffects;
  }

  public override withOperands(operands: readonly Value[]): JSXFragmentOp {
    const expected = this.operands().length;
    if (operands.length !== expected) {
      throw new Error(
        `JSXFragmentOp#${this.id} expected ${expected} operands, got ${operands.length}`,
      );
    }

    let index = 0;

    return new JSXFragmentOp(
      this.id,
      this.children.map((child) => mapChildOperands(child, () => operands[index++])),
      this.result,
    );
  }

  public override clone(context: OperationCloneContext): JSXFragmentOp {
    return new JSXFragmentOp(
      context.ids.operationId(),
      this.children.map((child) => cloneChild(context, child)),
      context.result(this.result),
    );
  }
}

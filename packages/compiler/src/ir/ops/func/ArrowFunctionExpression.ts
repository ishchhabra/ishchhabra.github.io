import { OperationId } from "../../core";
import { FuncOp } from "../../core/FuncOp";
import { Value } from "../../core/Value";

import { Operation, Trait } from "../../core/Operation";
import { makeCloneContext, requireModuleIR, type CloneContext } from "../../core/Operation";
/**
 * Represents an arrow function expression, e.g.
 *   `const arrow = (x) => x + 1;`
 *
 * `captures` are the outer-scope Places this closure reads from,
 * aligned by index with the FuncOp's capture params. Codegen binds
 * each capture param to `captures[i]` so the function body resolves
 * captured variables through the indirection layer.
 */
export class ArrowFunctionExpressionOp extends Operation {
  // Pure value creation: allocating a closure has no observable
  // side effects. Calls into the arrow are separate CallExpression
  // ops with their own (opaque) effects.
  static override readonly traits: ReadonlySet<Trait> = new Set([Trait.Pure]);

  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly funcOp: FuncOp,
    public readonly async: boolean,
    public readonly expression: boolean,
    public readonly generator: boolean,
    public readonly captures: Value[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ArrowFunctionExpressionOp {
    const moduleIR = requireModuleIR(ctx);
    const env = moduleIR.environment;
    const place = env.createValue();
    // Recursively deep-clone the nested FuncOp into the same target
    // module so the inlined / cloned arrow doesn't share its body with
    // the source. The clone self-registers in `moduleIR.functions`.
    return env.createOperation(
      ArrowFunctionExpressionOp,
      place,
      this.funcOp.clone(makeCloneContext(moduleIR)),
      this.async,
      this.expression,
      this.generator,
      this.captures,
    );
  }

  public rewrite(values: Map<Value, Value>): Operation {
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);

    if (!capturesChanged) {
      return this;
    }

    return new ArrowFunctionExpressionOp(
      this.id,
      this.place,
      this.funcOp,
      this.async,
      this.expression,
      this.generator,
      newCaptures,
    );
  }

  public operands(): Value[] {
    return this.captures;
  }

}

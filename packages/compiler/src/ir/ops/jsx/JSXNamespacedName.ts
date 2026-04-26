import { OperationId } from "../../core";
import { Value } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a JSX namespaced name in the IR.
 *
 * Examples:
 * - `svg:rect` in `<svg:rect>`
 * - `xml:space` in `<xml:space>`
 */
export class JSXNamespacedNameOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly namespace: string,
    public readonly name: string,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): JSXNamespacedNameOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(JSXNamespacedNameOp, place, this.namespace, this.name);
  }

  rewrite(): Operation {
    return this;
  }

  operands(): Value[] {
    return [];
  }
  public override getMemoryEffects(): import("../../memory/MemoryLocation").MemoryEffects {
    return { reads: [], writes: [] };
  }

  public override mayThrow(): boolean {
    return false;
  }

  public override mayDiverge(): boolean {
    return false;
  }

  public override get isDeterministic(): boolean {
    return true;
  }

  public override isObservable(): boolean {
    return false;
  }
}

import type { Environment } from "../../../environment";
import { OperationId } from "../../core";
import { Value } from "../../core";
import { isPureBuiltin, lookupBuiltin } from "../../builtins";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
import {
  effects,
  NoEffects,
  UnknownLocation,
  type MemoryEffects,
} from "../../memory/MemoryLocation";
import { getQualifiedName } from "../../../pipeline/passes/resolveConstant";
/**
 * Represents a call expression.
 *
 * Example:
 * foo(1, 2)
 */
export class CallExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Value,
    public readonly callee: Value,
    // Using args instead of arguments since arguments is a reserved word
    public readonly args: Value[],
    public readonly optional: boolean = false,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): CallExpressionOp {
    const env = ctx.environment;
    const place = env.createValue();
    return env.createOperation(CallExpressionOp, place, this.callee, this.args, this.optional);
  }

  rewrite(values: Map<Value, Value>): Operation {
    return new CallExpressionOp(
      this.id,
      this.place,
      values.get(this.callee) ?? this.callee,
      this.args.map((arg) => values.get(arg) ?? arg),
      this.optional,
    );
  }

  getOperands(): Value[] {
    return [this.callee, ...this.args];
  }

  /**
   * A call is pure when its callee resolves (via static dotted-name
   * walk) to a module-local builtin spec whose `hasSideEffects` is
   * `false`. `Math.random()` and `Date.now()` qualify even though
   * their results aren't foldable — DCE can still drop unused calls.
   *
   * Calls through imports or dynamic callees are treated as
   * side-effecting (conservative default). Arg purity isn't
   * considered here; this op returns true if it itself is
   * side-effect-free, even if its args were.
   */
  public override hasSideEffects(environment: Environment): boolean {
    const calleeOp = this.callee.definer as Operation | undefined;
    if (calleeOp === undefined) return true;
    const qualified = getQualifiedName(calleeOp, environment);
    if (qualified === undefined) return true;
    return !isPureBuiltin(lookupBuiltin(qualified));
  }

  /**
   * A pure builtin call has no memory effects; any other call may
   * read and write arbitrary memory (treat as `Unknown` on both
   * sides). This mirrors `hasSideEffects`: both use the same
   * callee-resolution + builtin-table lookup.
   */
  public override getMemoryEffects(environment: Environment): MemoryEffects {
    if (!this.hasSideEffects(environment)) return NoEffects;
    return effects([UnknownLocation], [UnknownLocation]);
  }

  public override print(): string {
    return `${this.place.print()} = Call ${this.callee.print()}(${this.args.map((a) => a.print()).join(", ")})`;
  }
}

import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents an assignment pattern with a default value.
 *
 * Examples:
 * - `function foo(a = 1)` - Parameter default value
 * - `const {x = 1} = obj` - Destructuring with default value
 */
export class AssignmentPatternOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly left: Place,
    public readonly right: Place,
    public readonly bindings: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): AssignmentPatternOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      AssignmentPatternOp,
      place,
      this.left,
      this.right,
      this.bindings,
    );
  }

  public rewrite(values: Map<Identifier, Place>): Operation {
    return new AssignmentPatternOp(
      this.id,
      this.place,
      values.get(this.left.identifier) ?? this.left,
      values.get(this.right.identifier) ?? this.right,
      this.bindings.map((binding) => values.get(binding.identifier) ?? binding),
    );
  }

  public getOperands(): Place[] {
    return [this.right];
  }

  public override getDefs(): Place[] {
    return [this.place, ...this.bindings];
  }

  public override hasSideEffects(): boolean {
    return false;
  }
}

import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
/**
 * Represents a memory instruction that copies the value of one place to another.
 *
 * For example, Copy(lval: x, value: y) means that the value at place y is copied to x.
 */
export class CopyOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly lval: Place,
    public readonly value: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): CopyOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(CopyOp, place, this.lval, this.value);
  }

  rewrite(values: Map<Identifier, Place>): CopyOp {
    return new CopyOp(
      this.id,
      this.place,
      values.get(this.lval.identifier) ?? this.lval,
      values.get(this.value.identifier) ?? this.value,
    );
  }

  getOperands(): Place[] {
    return [this.lval, this.value];
  }

  override getDefs(): Place[] {
    return [this.place, this.lval];
  }

  public override hasSideEffects(): boolean {
    return false;
  }

  public override print(): string {
    return `${this.place.print()} = Copy ${this.lval.print()} <- ${this.value.print()}`;
  }
}

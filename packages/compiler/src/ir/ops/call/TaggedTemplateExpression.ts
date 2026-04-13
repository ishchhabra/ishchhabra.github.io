import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";

import { Operation } from "../../core/Operation";
import type { CloneContext } from "../../core/Operation";
export class TaggedTemplateExpressionOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly tag: Place,
    public readonly quasi: Place,
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): TaggedTemplateExpressionOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      TaggedTemplateExpressionOp,
      place,
      this.tag,
      this.quasi,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    return new TaggedTemplateExpressionOp(
      this.id,
      this.place,
      values.get(this.tag.identifier) ?? this.tag,
      values.get(this.quasi.identifier) ?? this.quasi,
    );
  }

  getOperands(): Place[] {
    return [this.tag, this.quasi];
  }
}

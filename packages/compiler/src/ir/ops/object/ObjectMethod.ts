import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";
import { FuncOp } from "../../core/FuncOp";

import { Operation } from "../../core/Operation";
import { makeCloneContext, type CloneContext } from "../../core/Operation";
/**
 * Represents an object method in the IR.
 *
 * Examples:
 * - `{ foo() {} } // foo is the object method`
 */
export class ObjectMethodOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly key: Place,
    public readonly body: FuncOp,
    public readonly computed: boolean,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly kind: "method" | "get" | "set",
    public readonly captures: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ObjectMethodOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ObjectMethodOp,
      place,
      this.key,
      this.body.clone(makeCloneContext(moduleIR)),
      this.computed,
      this.generator,
      this.async,
      this.kind,
      this.captures,
    );
  }

  rewrite(values: Map<Identifier, Place>): Operation {
    const newKey = values.get(this.key.identifier) ?? this.key;
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    if (newKey === this.key && !capturesChanged) {
      return this;
    }
    return new ObjectMethodOp(
      this.id,
      this.place,
      newKey,
      this.body,
      this.computed,
      this.generator,
      this.async,
      this.kind,
      newCaptures,
    );
  }

  getOperands(): Place[] {
    return [this.key, ...this.captures];
  }
}

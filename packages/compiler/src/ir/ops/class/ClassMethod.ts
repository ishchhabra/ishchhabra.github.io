import { OperationId } from "../../core";
import { Identifier, Place } from "../../core";
import { FuncOp } from "../../core/FuncOp";

import { Operation } from "../../core/Operation";
import { makeCloneContext, type CloneContext } from "../../core/Operation";
/**
 * Represents a class method in the IR.
 *
 * Examples:
 * - `class C { foo() {} }`        // kind: "method"
 * - `class C { constructor() {} }` // kind: "constructor"
 * - `class C { get x() {} }`       // kind: "get"
 * - `class C { static foo() {} }`  // static: true
 *
 * Mirrors {@link ObjectMethodOp} but adds the `static` flag and the
 * "constructor" kind. As with object methods, the body is its own
 * {@link FuncOp} so existing function-level optimizations apply
 * uniformly. Non-computed keys are stored as a `Place` referencing a
 * {@link LiteralOp}, matching the convention in
 * {@link ObjectPropertyOp}.
 */
export class ClassMethodOp extends Operation {
  constructor(
    id: OperationId,
    public override readonly place: Place,
    public readonly key: Place,
    public readonly body: FuncOp,
    public readonly kind: "constructor" | "method" | "get" | "set",
    public readonly computed: boolean,
    public readonly isStatic: boolean,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id);
  }

  public clone(ctx: CloneContext): ClassMethodOp {
    const moduleIR = ctx.moduleIR;
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createOperation(
      ClassMethodOp,
      place,
      this.key,
      this.body.clone(makeCloneContext(moduleIR)),
      this.kind,
      this.computed,
      this.isStatic,
      this.generator,
      this.async,
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
    return new ClassMethodOp(
      this.id,
      this.place,
      newKey,
      this.body,
      this.kind,
      this.computed,
      this.isStatic,
      this.generator,
      this.async,
      newCaptures,
    );
  }

  getOperands(): Place[] {
    return [this.key, ...this.captures];
  }
}

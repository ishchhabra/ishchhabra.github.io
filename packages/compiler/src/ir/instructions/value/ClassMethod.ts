import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";
import { FunctionIR } from "../../core/FunctionIR";

/**
 * Represents a class method in the IR.
 *
 * Examples:
 * - `class C { foo() {} }`        // kind: "method"
 * - `class C { constructor() {} }` // kind: "constructor"
 * - `class C { get x() {} }`       // kind: "get"
 * - `class C { static foo() {} }`  // static: true
 *
 * Mirrors {@link ObjectMethodInstruction} but adds the `static` flag and the
 * "constructor" kind. As with object methods, the body is its own
 * {@link FunctionIR} so existing function-level optimizations apply
 * uniformly. Non-computed keys are stored as a `Place` referencing a
 * {@link LiteralInstruction}, matching the convention in
 * {@link ObjectPropertyInstruction}.
 */
export class ClassMethodInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly key: Place,
    public readonly body: FunctionIR,
    public readonly kind: "constructor" | "method" | "get" | "set",
    public readonly computed: boolean,
    public readonly isStatic: boolean,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly captures: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ClassMethodInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ClassMethodInstruction,
      place,
      this.key,
      this.body,
      this.kind,
      this.computed,
      this.isStatic,
      this.generator,
      this.async,
      this.captures,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const newKey = values.get(this.key.identifier) ?? this.key;
    const newCaptures = this.captures.map((c) => c.rewrite(values));
    const capturesChanged = newCaptures.some((c, i) => c !== this.captures[i]);
    if (newKey === this.key && !capturesChanged) {
      return this;
    }
    return new ClassMethodInstruction(
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

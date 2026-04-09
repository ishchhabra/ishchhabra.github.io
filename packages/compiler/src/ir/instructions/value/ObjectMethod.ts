import type { ModuleIR } from "../../core/ModuleIR";
import { BaseInstruction, InstructionId, ValueInstruction } from "../../base";
import { Identifier, Place } from "../../core";
import { FunctionIR } from "../../core/FunctionIR";

/**
 * Represents an object method in the IR.
 *
 * Examples:
 * - `{ foo() {} } // foo is the object method`
 */
export class ObjectMethodInstruction extends ValueInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly key: Place,
    public readonly body: FunctionIR,
    public readonly computed: boolean,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly kind: "method" | "get" | "set",
    public readonly captures: Place[] = [],
  ) {
    super(id, place);
  }

  public clone(moduleIR: ModuleIR): ObjectMethodInstruction {
    const identifier = moduleIR.environment.createIdentifier();
    const place = moduleIR.environment.createPlace(identifier);
    return moduleIR.environment.createInstruction(
      ObjectMethodInstruction,
      place,
      this.key,
      this.body,
      this.computed,
      this.generator,
      this.async,
      this.kind,
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
    return new ObjectMethodInstruction(
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

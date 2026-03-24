import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
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
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly key: Place,
    public readonly body: FunctionIR,
    public readonly computed: boolean,
    public readonly generator: boolean,
    public readonly async: boolean,
    public readonly kind: "method" | "get" | "set",
    public readonly captures: Place[] = [],
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): ObjectMethodInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      ObjectMethodInstruction,
      place,
      this.nodePath,
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
      this.nodePath,
      newKey,
      this.body,
      this.computed,
      this.generator,
      this.async,
      this.kind,
      newCaptures,
    );
  }

  getReadPlaces(): Place[] {
    return [this.key, ...this.captures];
  }
}

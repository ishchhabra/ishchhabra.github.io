import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, JSXInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * JSX tag name after lowering: `value` is the place defined by a
 * `LiteralInstruction` (intrinsic string) or `LoadLocalInstruction` /
 * `LoadGlobalInstruction` / `LoadContextInstruction` (component reference).
 * This instruction’s `place` is what opening/member elements use as `tagPlace`;
 * codegen maps it to a `JSXIdentifier` (or coerces from literal/load output).
 */
export class JSXIdentifierInstruction extends JSXInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly value: Place,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): JSXIdentifierInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(
      JSXIdentifierInstruction,
      place,
      this.nodePath,
      this.value,
    );
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const rewrittenValue = this.value.rewrite(values);
    if (rewrittenValue === this.value) {
      return this;
    }
    return new JSXIdentifierInstruction(this.id, this.place, this.nodePath, rewrittenValue);
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  public override get hasSideEffects(): boolean {
    return false;
  }
}

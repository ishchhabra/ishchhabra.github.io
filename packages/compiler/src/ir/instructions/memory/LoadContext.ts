import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { BaseInstruction, InstructionId, MemoryInstruction } from "../../base";
import { Identifier, Place } from "../../core";

/**
 * Represents an instruction that loads a value from a context variable —
 * a mutable variable captured across closure boundaries. Semantically identical
 * to LoadLocalInstruction at codegen time, but treated differently by SSA
 * (skipped during phi placement and renaming) and by optimization passes
 * (loads are considered side-effecting because closures may mutate the value).
 */
export class LoadContextInstruction extends MemoryInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
    public readonly value: Place,
  ) {
    super(id, place, nodePath);
  }

  public clone(environment: Environment): LoadContextInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(LoadContextInstruction, place, this.nodePath, this.value);
  }

  rewrite(values: Map<Identifier, Place>): BaseInstruction {
    const rewrittenTarget = values.get(this.value.identifier) ?? this.value;

    if (rewrittenTarget === this.value) {
      return this;
    }

    return new LoadContextInstruction(this.id, this.place, this.nodePath, rewrittenTarget);
  }

  getReadPlaces(): Place[] {
    return [this.value];
  }

  public get isPure(): boolean {
    return true;
  }
}

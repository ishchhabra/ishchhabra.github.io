import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../environment";
import { BaseInstruction, InstructionId } from "../base";
import { Place } from "../core";

export class DebuggerStatementInstruction extends BaseInstruction {
  constructor(
    public readonly id: InstructionId,
    public readonly place: Place,
    public readonly nodePath: NodePath<t.Node> | undefined,
  ) {
    super(id, place, nodePath);
  }

  public override hasSideEffects(): boolean {
    return true;
  }

  public clone(environment: Environment): DebuggerStatementInstruction {
    const identifier = environment.createIdentifier();
    const place = environment.createPlace(identifier);
    return environment.createInstruction(DebuggerStatementInstruction, place, this.nodePath);
  }

  rewrite(): BaseInstruction {
    return this;
  }

  getReadPlaces() {
    return [];
  }
}

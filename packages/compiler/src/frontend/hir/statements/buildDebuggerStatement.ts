import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { DebuggerStatementInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildDebuggerStatement(
  nodePath: NodePath<t.DebuggerStatement>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(DebuggerStatementInstruction, place, nodePath);
  functionBuilder.addInstruction(instruction);
  return place;
}

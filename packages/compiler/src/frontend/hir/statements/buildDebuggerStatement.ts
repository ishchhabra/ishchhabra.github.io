import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { DebuggerStatementInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildDebuggerStatement(
  _node: ESTree.DebuggerStatement,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(DebuggerStatementInstruction, place);
  functionBuilder.addInstruction(instruction);
  return place;
}

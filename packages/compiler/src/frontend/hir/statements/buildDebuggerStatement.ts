import type { DebuggerStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { DebuggerStatementOp, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildDebuggerStatement(
  _node: DebuggerStatement,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(DebuggerStatementOp, place);
  functionBuilder.addOp(instruction);
  return place;
}

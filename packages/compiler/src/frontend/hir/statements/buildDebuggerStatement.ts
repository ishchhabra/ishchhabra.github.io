import type { DebuggerStatement } from "oxc-parser";
import { Environment } from "../../../environment";
import { DebuggerStatementOp, Value } from "../../../ir";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildDebuggerStatement(
  _node: DebuggerStatement,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
): Value {
  const place = environment.createValue();
  const instruction = environment.createOperation(DebuggerStatementOp, place);
  functionBuilder.addOp(instruction);
  return place;
}

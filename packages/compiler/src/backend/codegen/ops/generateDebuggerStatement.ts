import * as t from "@babel/types";
import { DebuggerStatementOp } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateDebuggerStatementOp(
  instruction: DebuggerStatementOp,
  generator: CodeGenerator,
): t.DebuggerStatement {
  const node = t.debuggerStatement();
  generator.places.set(instruction.place.id, node);
  return node;
}

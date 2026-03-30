import * as t from "@babel/types";
import { DebuggerStatementInstruction } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateDebuggerStatementInstruction(
  instruction: DebuggerStatementInstruction,
  generator: CodeGenerator,
): t.DebuggerStatement {
  const node = t.debuggerStatement();
  generator.places.set(instruction.place.id, node);
  return node;
}

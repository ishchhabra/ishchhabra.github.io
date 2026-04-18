import * as t from "@babel/types";
import { ReturnOp } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateReturnTerminal(
  terminal: ReturnOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (terminal.value === null) {
    return [t.returnStatement()];
  }

  const value = generator.values.get(terminal.value.id);
  if (value === undefined) {
    throw new Error(`Value ${terminal.value.id} not found`);
  }

  t.assertExpression(value);
  return [t.returnStatement(value)];
}

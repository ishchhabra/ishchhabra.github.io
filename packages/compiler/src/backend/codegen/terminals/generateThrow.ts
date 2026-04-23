import * as t from "@babel/types";
import { ThrowTermOp } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateThrowTerminal(
  terminal: ThrowTermOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const argument = generator.values.get(terminal.value.id);
  if (argument === undefined) {
    throw new Error(`Value ${terminal.value.id} not found for ThrowTermOp value`);
  }
  t.assertExpression(argument);
  return [t.throwStatement(argument)];
}

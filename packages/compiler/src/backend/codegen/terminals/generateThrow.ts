import * as t from "@babel/types";
import { ThrowOp } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateThrowTerminal(
  terminal: ThrowOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const argument = generator.values.get(terminal.value.id);
  if (argument === undefined) {
    throw new Error(`Value ${terminal.value.id} not found for ThrowOp value`);
  }
  t.assertExpression(argument);
  return [t.throwStatement(argument)];
}

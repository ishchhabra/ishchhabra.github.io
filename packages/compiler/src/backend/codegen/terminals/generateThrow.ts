import * as t from "@babel/types";
import { ThrowTerminal } from "../../../ir";
import { CodeGenerator } from "../../CodeGenerator";

export function generateThrowTerminal(
  terminal: ThrowTerminal,
  generator: CodeGenerator,
): Array<t.Statement> {
  const argument = generator.places.get(terminal.value.id);
  if (argument === undefined) {
    throw new Error(`Place ${terminal.value.id} not found for ThrowTerminal value`);
  }
  t.assertExpression(argument);
  return [t.throwStatement(argument)];
}

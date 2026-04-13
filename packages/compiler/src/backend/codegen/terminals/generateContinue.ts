import * as t from "@babel/types";
import { ContinueOp } from "../../../ir";

export function generateContinueTerminal(terminal: ContinueOp): Array<t.Statement> {
  return [t.continueStatement(terminal.label ? t.identifier(terminal.label) : null)];
}

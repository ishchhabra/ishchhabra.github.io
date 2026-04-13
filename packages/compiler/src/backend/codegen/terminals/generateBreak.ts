import * as t from "@babel/types";
import { BreakOp } from "../../../ir";

export function generateBreakTerminal(terminal: BreakOp): Array<t.Statement> {
  return [t.breakStatement(terminal.label ? t.identifier(terminal.label) : null)];
}

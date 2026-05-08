import { EmptyStatement } from "oxc-parser";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

/**
 * Lowers an empty statement.
 *
 * Empty statements have no runtime effect and emit no IR.
 */
export function lowerEmptyStatement(builder: FunctionIRBuilder, statement: EmptyStatement): void {
  void builder;
  void statement;
}

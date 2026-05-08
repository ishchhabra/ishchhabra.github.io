import type { BlockStatement } from "oxc-parser";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerStatement } from "./lowerStatement";
import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";

/**
 * Lowers a block statement body in source order.
 */
export function lowerBlockStatement(builder: FunctionIRBuilder, statement: BlockStatement): void {
  lowerDeclarationInstantiation(builder, statement);

  for (const child of statement.body) {
    lowerStatement(builder, child);
  }
}

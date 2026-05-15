import type { BlockStatement } from "oxc-parser";

import { lowerDeclarationInstantiation } from "../declarations/lowerDeclarationInstantiation";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerStatement } from "./lowerStatement";

/**
 * Lowers a block statement body in source order.
 */
export function lowerBlockStatement(builder: FunctionIRBuilder, statement: BlockStatement): void {
  lowerDeclarationInstantiation(builder, statement);

  for (const child of statement.body) {
    if (builder.currentBlock.isTerminated) break;

    lowerStatement(builder, child);
  }
}

import * as t from "@babel/types";
import { BlockOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a textbook MLIR `BlockOp` as `{ ... }`. Inline structured op.
 */
export function generateBlockStructure(
  structure: BlockOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  const bodyEntryId = structure.bodyRegion.entry.id;
  const bodyStatements = generateBasicBlock(bodyEntryId, funcOp, generator);
  return [t.blockStatement(bodyStatements)];
}

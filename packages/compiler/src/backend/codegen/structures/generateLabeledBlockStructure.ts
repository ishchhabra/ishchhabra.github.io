import * as t from "@babel/types";
import { LabeledBlockOp } from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBasicBlock } from "../generateBlock";

/**
 * Emit a textbook MLIR `LabeledBlockOp` as `label: { ... }`.
 */
export function generateLabeledBlockStructure(
  structure: LabeledBlockOp,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  generator.controlStack.push({
    kind: "label",
    label: structure.label,
    breakTarget: undefined,
  });
  const bodyEntryId = structure.bodyRegion.entry.id;
  const bodyStatements = generateBasicBlock(bodyEntryId, funcOp, generator);
  generator.controlStack.pop();

  return [
    t.labeledStatement(t.identifier(structure.label), t.blockStatement(bodyStatements)),
  ];
}

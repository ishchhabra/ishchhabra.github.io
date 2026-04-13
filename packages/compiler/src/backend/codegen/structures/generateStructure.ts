import * as t from "@babel/types";
import { Operation, BlockOp, ForInOp, ForOfOp, LabeledBlockOp, TernaryOp } from "../../../ir";
import { FunctionIR } from "../../../ir/core/FunctionIR";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlockStructure } from "./generateBlockStructure";
import { generateForInStructure } from "./generateForInStructure";
import { generateForOfStructure } from "./generateForOfStructure";
import { generateLabeledBlockStructure } from "./generateLabeledBlockStructure";
import { generateTernaryStructure } from "./generateTernaryStructure";

export function generateStructure(
  structure: Operation,
  functionIR: FunctionIR,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (structure instanceof BlockOp) {
    return generateBlockStructure(structure, functionIR, generator);
  }
  if (structure instanceof ForInOp) {
    return generateForInStructure(structure, functionIR, generator);
  }
  if (structure instanceof ForOfOp) {
    return generateForOfStructure(structure, functionIR, generator);
  }
  if (structure instanceof TernaryOp) {
    return generateTernaryStructure(structure, functionIR, generator);
  }
  if (structure instanceof LabeledBlockOp) {
    return generateLabeledBlockStructure(structure, functionIR, generator);
  }

  throw new Error(
    `Unsupported structure type: ${(structure as { constructor: { name: string } }).constructor.name}`,
  );
}

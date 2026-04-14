import * as t from "@babel/types";
import {
  Operation,
  BlockOp,
  ForInOp,
  ForOfOp,
  ForOp,
  IfOp,
  LabeledBlockOp,
  SwitchOp,
  TryOp,
  WhileOp,
} from "../../../ir";
import { FuncOp } from "../../../ir/core/FuncOp";
import { CodeGenerator } from "../../CodeGenerator";
import { generateBlockStructure } from "./generateBlockStructure";
import { generateForInStructure } from "./generateForInStructure";
import { generateForOfStructure } from "./generateForOfStructure";
import { generateForStructure } from "./generateForStructure";
import { generateIfStructure } from "./generateIfStructure";
import { generateLabeledBlockStructure } from "./generateLabeledBlockStructure";
import { generateSwitchStructure } from "./generateSwitchStructure";
import { generateTryStructure } from "./generateTryStructure";
import { generateWhileStructure } from "./generateWhileStructure";

export function generateStructure(
  structure: Operation,
  funcOp: FuncOp,
  generator: CodeGenerator,
): Array<t.Statement> {
  if (structure instanceof BlockOp) {
    return generateBlockStructure(structure, funcOp, generator);
  }
  if (structure instanceof ForInOp) {
    return generateForInStructure(structure, funcOp, generator);
  }
  if (structure instanceof ForOfOp) {
    return generateForOfStructure(structure, funcOp, generator);
  }
  if (structure instanceof ForOp) {
    return generateForStructure(structure, funcOp, generator);
  }
  if (structure instanceof IfOp) {
    return generateIfStructure(structure, funcOp, generator);
  }
  if (structure instanceof LabeledBlockOp) {
    return generateLabeledBlockStructure(structure, funcOp, generator);
  }
  if (structure instanceof WhileOp) {
    return generateWhileStructure(structure, funcOp, generator);
  }
  if (structure instanceof SwitchOp) {
    return generateSwitchStructure(structure, funcOp, generator);
  }
  if (structure instanceof TryOp) {
    return generateTryStructure(structure, funcOp, generator);
  }

  throw new Error(
    `Unsupported structure type: ${(structure as { constructor: { name: string } }).constructor.name}`,
  );
}

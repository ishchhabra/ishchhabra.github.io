import * as t from "@babel/types";
import { SpreadElementOp } from "../../../../ir";
import type { PatternOp } from "../../../../ir/categories";
import { AssignmentPatternOp } from "../../../../ir/ops/pattern/AssignmentPattern";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateAssignmentPatternOp } from "./generateAssignmentPattern";
import { generateSpreadElementOp } from "./generateSpreadElement";

export function generatePatternOp(
  instruction: PatternOp | SpreadElementOp,
  generator: CodeGenerator,
): t.Pattern | t.SpreadElement {
  if (instruction instanceof AssignmentPatternOp) {
    return generateAssignmentPatternOp(instruction, generator);
  } else if (instruction instanceof SpreadElementOp) {
    return generateSpreadElementOp(instruction, generator);
  }

  throw new Error(
    `Unsupported pattern type: ${(instruction as { constructor: { name: string } }).constructor.name}`,
  );
}

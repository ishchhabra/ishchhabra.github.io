import * as t from "@babel/types";
import { PatternInstruction, SpreadElementInstruction } from "../../../../ir";
import { AssignmentPatternInstruction } from "../../../../ir/instructions/pattern/AssignmentPattern";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateAssignmentPatternInstruction } from "./generateAssignmentPattern";
import { generateSpreadElementInstruction } from "./generateSpreadElement";

export function generatePatternInstruction(
  instruction: PatternInstruction,
  generator: CodeGenerator,
): t.Pattern | t.SpreadElement {
  if (instruction instanceof AssignmentPatternInstruction) {
    return generateAssignmentPatternInstruction(instruction, generator);
  } else if (instruction instanceof SpreadElementInstruction) {
    return generateSpreadElementInstruction(instruction, generator);
  }

  throw new Error(`Unsupported pattern type: ${instruction.constructor.name}`);
}

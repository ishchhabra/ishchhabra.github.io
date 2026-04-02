import * as t from "@babel/types";
import { DeclarationInstruction } from "../../../../ir";
import { ClassDeclarationInstruction } from "../../../../ir/instructions/declaration/Class";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateClassDeclarationInstruction } from "./generateClassDeclaration";

export function generateDeclarationInstruction(
  instruction: DeclarationInstruction,
  generator: CodeGenerator,
): t.ClassDeclaration {
  if (instruction instanceof ClassDeclarationInstruction) {
    return generateClassDeclarationInstruction(instruction, generator);
  }

  throw new Error(`Unsupported declaration type: ${instruction.constructor.name}`);
}

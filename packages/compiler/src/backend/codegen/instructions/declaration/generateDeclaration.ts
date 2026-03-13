import * as t from "@babel/types";
import { DeclarationInstruction, FunctionDeclarationInstruction } from "../../../../ir";
import { ClassDeclarationInstruction } from "../../../../ir/instructions/declaration/Class";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateClassDeclarationInstruction } from "./generateClassDeclaration";
import { generateFunctionDeclarationInstruction } from "./generateFunctionDeclaration";

export function generateDeclarationInstruction(
  instruction: DeclarationInstruction,
  generator: CodeGenerator,
): t.FunctionDeclaration | t.ClassDeclaration {
  if (instruction instanceof FunctionDeclarationInstruction) {
    return generateFunctionDeclarationInstruction(instruction, generator);
  } else if (instruction instanceof ClassDeclarationInstruction) {
    return generateClassDeclarationInstruction(instruction, generator);
  }

  throw new Error(`Unsupported declaration type: ${instruction.constructor.name}`);
}

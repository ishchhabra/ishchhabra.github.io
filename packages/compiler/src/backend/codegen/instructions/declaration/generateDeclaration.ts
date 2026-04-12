import * as t from "@babel/types";
import { DeclarationInstruction } from "../../../../ir";
import { ClassDeclarationInstruction } from "../../../../ir/instructions/declaration/ClassDeclaration";
import { FunctionDeclarationInstruction } from "../../../../ir/instructions/declaration/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateClassDeclarationInstruction } from "./generateClassDeclaration";
import { generateFunctionDeclarationInstruction } from "./generateFunctionDeclaration";

export function generateDeclarationInstruction(
  instruction: DeclarationInstruction,
  generator: CodeGenerator,
): t.Declaration {
  if (instruction instanceof FunctionDeclarationInstruction) {
    return generateFunctionDeclarationInstruction(instruction, generator);
  }
  if (instruction instanceof ClassDeclarationInstruction) {
    return generateClassDeclarationInstruction(instruction, generator);
  }

  throw new Error(`Unsupported declaration instruction: ${instruction.constructor.name}`);
}

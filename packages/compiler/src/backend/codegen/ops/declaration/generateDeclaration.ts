import * as t from "@babel/types";
import type { DeclarationOp } from "../../../../ir/categories";
import { ClassDeclarationOp } from "../../../../ir/ops/class/ClassDeclaration";
import { FunctionDeclarationOp } from "../../../../ir/ops/func/FunctionDeclaration";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateClassDeclarationOp } from "./generateClassDeclaration";
import { generateFunctionDeclarationOp } from "./generateFunctionDeclaration";

export function generateDeclarationOp(
  instruction: DeclarationOp,
  generator: CodeGenerator,
): t.Declaration {
  if (instruction instanceof FunctionDeclarationOp) {
    return generateFunctionDeclarationOp(instruction, generator);
  }
  if (instruction instanceof ClassDeclarationOp) {
    return generateClassDeclarationOp(instruction, generator);
  }

  throw new Error(
    `Unsupported declaration instruction: ${(instruction as { constructor: { name: string } }).constructor.name}`,
  );
}

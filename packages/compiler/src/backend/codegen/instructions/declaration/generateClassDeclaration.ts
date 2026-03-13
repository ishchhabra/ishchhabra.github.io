import * as t from "@babel/types";
import { ClassDeclarationInstruction } from "../../../../ir/instructions/declaration/Class";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateClassDeclarationInstruction(
  instruction: ClassDeclarationInstruction,
  generator: CodeGenerator,
): t.ClassDeclaration {
  const node = instruction.nodePath!.node;
  generator.places.set(instruction.place.id, node);
  return node;
}

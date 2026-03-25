import * as t from "@babel/types";
import { ExportAllInstruction } from "../../../../ir/instructions/module/ExportAll";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportAllInstruction(
  instruction: ExportAllInstruction,
  generator: CodeGenerator,
): t.ExportAllDeclaration {
  const source = t.stringLiteral(instruction.source);
  const node = t.exportAllDeclaration(source);
  generator.places.set(instruction.place.id, node);
  return node;
}

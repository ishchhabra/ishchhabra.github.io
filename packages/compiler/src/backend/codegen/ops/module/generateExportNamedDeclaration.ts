import * as t from "@babel/types";
import { ExportNamedDeclarationOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportNamedDeclarationOp(
  instruction: ExportNamedDeclarationOp,
  generator: CodeGenerator,
): t.ExportNamedDeclaration {
  if (instruction.declaration !== undefined) {
    const declaration = generator.values.get(instruction.declaration.id);
    if (declaration === undefined) {
      throw new Error(`Value ${instruction.declaration.id} not found`);
    }

    t.assertDeclaration(declaration);
    const node = t.exportNamedDeclaration(declaration, []);
    generator.values.set(instruction.place.id, node);
    return node;
  }

  const specifiers = instruction.specifiers.map((specifier) => {
    const node = generator.values.get(specifier.id);
    if (node === undefined) {
      throw new Error(`Value ${specifier.id} not found`);
    }

    t.assertExportSpecifier(node);
    return node;
  });

  const node = t.exportNamedDeclaration(null, specifiers);
  generator.values.set(instruction.place.id, node);
  return node;
}

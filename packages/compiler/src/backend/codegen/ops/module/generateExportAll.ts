import * as t from "@babel/types";
import { ExportAllOp } from "../../../../ir/ops/module/ExportAll";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportAllOp(
  instruction: ExportAllOp,
  generator: CodeGenerator,
): t.ExportAllDeclaration | t.ExportNamedDeclaration {
  const source = t.stringLiteral(instruction.source);
  if (instruction.exportedName !== undefined) {
    const node = t.exportNamedDeclaration(
      null,
      [t.exportNamespaceSpecifier(t.identifier(instruction.exportedName))],
      source,
    );
    generator.values.set(instruction.place.id, node);
    return node;
  }

  const node = t.exportAllDeclaration(source);
  generator.values.set(instruction.place.id, node);
  return node;
}

import * as t from "@babel/types";
import { toIdentifierOrStringLiteral } from "../../../../babel-utils";
import { ExportSpecifierOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportSpecifierOp(
  instruction: ExportSpecifierOp,
  generator: CodeGenerator,
): t.ExportSpecifier {
  const latest = generator.moduleIR.environment.getLatestDeclaration(instruction.localDeclarationId);
  const binding = generator.moduleIR.environment.getDeclarationBinding(instruction.localDeclarationId);
  const localPlace = latest?.value ?? binding;
  if (localPlace === undefined) throw new Error("Export specifier local binding not found");
  const localNode = generator.getPlaceIdentifier(localPlace);
  const exported = toIdentifierOrStringLiteral(instruction.exported);

  const node = t.exportSpecifier(localNode, exported);
  generator.values.set(instruction.place.id, node);
  return node;
}

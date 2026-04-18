import * as t from "@babel/types";
import { toIdentifierOrStringLiteral } from "../../../../babel-utils";
import { ExportSpecifierOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportSpecifierOp(
  instruction: ExportSpecifierOp,
  generator: CodeGenerator,
): t.ExportSpecifier {
  const localNode = generator.values.get(instruction.localPlace.id);
  let local: t.Identifier;
  if (t.isIdentifier(localNode)) {
    local = localNode;
  } else if (t.isFunctionDeclaration(localNode) && localNode.id) {
    local = localNode.id;
  } else if (t.isClassDeclaration(localNode) && localNode.id) {
    local = localNode.id;
  } else {
    throw new Error("Export specifier local must resolve to an identifier");
  }
  const exported = toIdentifierOrStringLiteral(instruction.exported);

  const node = t.exportSpecifier(local, exported);
  generator.values.set(instruction.place.id, node);
  return node;
}

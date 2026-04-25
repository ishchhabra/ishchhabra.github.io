import * as t from "@babel/types";
import { toIdentifierOrStringLiteral } from "../../../../babel-utils";
import { ExportSpecifierOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportSpecifierOp(
  instruction: ExportSpecifierOp,
  generator: CodeGenerator,
): t.ExportSpecifier {
  const localNode = generator.getPlaceIdentifier(instruction.local);
  const exported = toIdentifierOrStringLiteral(instruction.exported);

  const node = t.exportSpecifier(localNode, exported);
  generator.values.set(instruction.place.id, node);
  return node;
}

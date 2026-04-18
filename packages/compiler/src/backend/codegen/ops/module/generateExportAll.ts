import * as t from "@babel/types";
import { ExportAllOp } from "../../../../ir/ops/module/ExportAll";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateExportAllOp(
  instruction: ExportAllOp,
  generator: CodeGenerator,
): t.ExportAllDeclaration {
  const source = t.stringLiteral(instruction.source);
  const node = t.exportAllDeclaration(source);
  generator.values.set(instruction.place.id, node);
  return node;
}

import type { ExportAllDeclaration } from "oxc-parser";
import { Environment } from "../../../environment";
import { ExportAllOp } from "../../../ir/ops/module/ExportAll";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportAllDeclaration(
  node: ExportAllDeclaration,
  functionBuilder: FuncOpBuilder,
  _moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const source = node.source.value as string;
  const exportedName = getExportedName(node);

  const place = environment.createValue();
  const instruction = environment.createOperation(ExportAllOp, place, source, exportedName);
  functionBuilder.addOp(instruction);
  return place;
}

function getExportedName(node: ExportAllDeclaration): string | undefined {
  if (node.exported === null || node.exported === undefined) {
    return undefined;
  }
  if (node.exported.type === "Identifier") {
    return node.exported.name;
  }
  return node.exported.value;
}

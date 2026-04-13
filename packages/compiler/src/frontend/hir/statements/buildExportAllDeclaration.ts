import type { ExportAllDeclaration } from "oxc-parser";
import { Environment } from "../../../environment";
import { ExportAllOp } from "../../../ir/ops/module/ExportAll";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportAllDeclaration(
  node: ExportAllDeclaration,
  functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const source = node.source.value as string;

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(ExportAllOp, place, source);
  functionBuilder.addOp(instruction);
  return place;
}

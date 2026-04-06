import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { ExportAllInstruction } from "../../../ir/instructions/module/ExportAll";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportAllDeclaration(
  node: ESTree.ExportAllDeclaration,
  functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const source = node.source.value as string;

  const identifier = environment.createIdentifier(undefined, functionBuilder.scope.allocateName());
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ExportAllInstruction, place, source);
  functionBuilder.addInstruction(instruction);
  return place;
}

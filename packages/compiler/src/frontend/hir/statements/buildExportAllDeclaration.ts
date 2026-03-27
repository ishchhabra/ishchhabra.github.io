import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { ExportAllInstruction } from "../../../ir/instructions/module/ExportAll";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildExportAllDeclaration(
  nodePath: NodePath<t.ExportAllDeclaration>,
  functionBuilder: FunctionIRBuilder,
  _moduleBuilder: ModuleIRBuilder,
  environment: Environment,
) {
  const source = nodePath.node.source.value;

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(ExportAllInstruction, place, nodePath, source);
  functionBuilder.addInstruction(instruction);
  return place;
}

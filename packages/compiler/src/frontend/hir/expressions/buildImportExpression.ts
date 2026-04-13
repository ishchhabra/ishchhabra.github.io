import type { ImportExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ImportExpressionOp, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildImportExpression(
  node: ImportExpression,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const sourcePlace = buildNode(node.source, scope, functionBuilder, moduleBuilder, environment);
  if (sourcePlace === undefined || Array.isArray(sourcePlace)) {
    throw new Error("Dynamic import source must be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(ImportExpressionOp, place, sourcePlace);
  functionBuilder.addOp(instruction);
  return place;
}

import type * as AST from "../../estree";
import { Environment } from "../../../environment";
import { ImportExpressionInstruction, Place } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildImportExpression(
  node: AST.ImportExpression,
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
  const instruction = environment.createInstruction(
    ImportExpressionInstruction,
    place,
    sourcePlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

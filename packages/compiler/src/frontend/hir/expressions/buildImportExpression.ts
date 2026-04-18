import type { ImportExpression } from "oxc-parser";
import { Environment } from "../../../environment";
import { ImportExpressionOp, Value } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildImportExpression(
  node: ImportExpression,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Value {
  const sourcePlace = buildNode(node.source, scope, functionBuilder, moduleBuilder, environment);
  if (sourcePlace === undefined || Array.isArray(sourcePlace)) {
    throw new Error("Dynamic import source must be a single place");
  }

  const place = environment.createValue();
  const instruction = environment.createOperation(ImportExpressionOp, place, sourcePlace);
  functionBuilder.addOp(instruction);
  return place;
}

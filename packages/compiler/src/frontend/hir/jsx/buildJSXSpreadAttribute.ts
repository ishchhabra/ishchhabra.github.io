import type { JSXSpreadAttribute } from "oxc-parser";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { JSXSpreadAttributeOp } from "../../../ir/ops/jsx/JSXSpreadAttribute";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXSpreadAttribute(
  node: JSXSpreadAttribute,
  scope: Scope,
  functionBuilder: FuncOpBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const argumentPlace = buildNode(
    node.argument,
    scope,
    functionBuilder,
    moduleBuilder,
    environment,
  );
  if (argumentPlace === undefined || Array.isArray(argumentPlace)) {
    throw new Error("JSX spread attribute argument should be a single place");
  }

  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(JSXSpreadAttributeOp, place, argumentPlace);
  functionBuilder.addOp(instruction);
  return place;
}

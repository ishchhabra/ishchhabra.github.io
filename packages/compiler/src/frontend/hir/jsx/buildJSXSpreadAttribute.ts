import type * as JSX from "estree-jsx";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { JSXSpreadAttributeInstruction } from "../../../ir/instructions/jsx/JSXSpreadAttribute";
import { type Scope } from "../../scope/Scope";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXSpreadAttribute(
  node: JSX.JSXSpreadAttribute,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
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
  const instruction = environment.createInstruction(
    JSXSpreadAttributeInstruction,
    place,
    argumentPlace,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

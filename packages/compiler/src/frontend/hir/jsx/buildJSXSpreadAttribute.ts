import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { Place } from "../../../ir";
import { JSXSpreadAttributeInstruction } from "../../../ir/instructions/jsx/JSXSpreadAttribute";
import { buildNode } from "../buildNode";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";

export function buildJSXSpreadAttribute(
  nodePath: NodePath<t.JSXSpreadAttribute>,
  functionBuilder: FunctionIRBuilder,
  moduleBuilder: ModuleIRBuilder,
  environment: Environment,
): Place {
  const argumentPath = nodePath.get("argument");
  const argumentPlace = buildNode(argumentPath, functionBuilder, moduleBuilder, environment);
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

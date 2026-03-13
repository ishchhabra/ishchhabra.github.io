import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JSXNamespacedNameInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXNamespacedName(
  nodePath: NodePath<t.JSXNamespacedName>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXNamespacedNameInstruction,
    place,
    nodePath,
    nodePath.node.namespace.name,
    nodePath.node.name.name,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

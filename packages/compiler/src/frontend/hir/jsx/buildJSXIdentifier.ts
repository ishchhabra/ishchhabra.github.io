import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { JSXIdentifierInstruction, Place } from "../../../ir";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildJSXIdentifier(
  nodePath: NodePath<t.JSXIdentifier>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
): Place {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    JSXIdentifierInstruction,
    place,
    nodePath,
    nodePath.node.name,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { MetaPropertyInstruction } from "../../../ir/instructions/value/MetaProperty";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildMetaProperty(
  nodePath: NodePath<t.MetaProperty>,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    MetaPropertyInstruction,
    place,
    nodePath.node.meta.name,
    nodePath.node.property.name,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

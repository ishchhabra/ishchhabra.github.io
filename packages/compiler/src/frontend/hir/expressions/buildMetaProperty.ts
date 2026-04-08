import type { MetaProperty } from "oxc-parser";
import { Environment } from "../../../environment";
import { MetaPropertyInstruction } from "../../../ir/instructions/value/MetaProperty";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildMetaProperty(
  node: MetaProperty,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createInstruction(
    MetaPropertyInstruction,
    place,
    node.meta.name,
    node.property.name,
  );
  functionBuilder.addInstruction(instruction);
  return place;
}

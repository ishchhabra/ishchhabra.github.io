import type { MetaProperty } from "oxc-parser";
import { Environment } from "../../../environment";
import { MetaPropertyOp } from "../../../ir/ops/prop/MetaProperty";
import { FunctionIRBuilder } from "../FunctionIRBuilder";

export function buildMetaProperty(
  node: MetaProperty,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const identifier = environment.createIdentifier();
  const place = environment.createPlace(identifier);
  const instruction = environment.createOperation(
    MetaPropertyOp,
    place,
    node.meta.name,
    node.property.name,
  );
  functionBuilder.addOp(instruction);
  return place;
}

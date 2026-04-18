import type { MetaProperty } from "oxc-parser";
import { Environment } from "../../../environment";
import { MetaPropertyOp } from "../../../ir/ops/prop/MetaProperty";
import { FuncOpBuilder } from "../FuncOpBuilder";

export function buildMetaProperty(
  node: MetaProperty,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const place = environment.createValue();
  const instruction = environment.createOperation(
    MetaPropertyOp,
    place,
    node.meta.name,
    node.property.name,
  );
  functionBuilder.addOp(instruction);
  return place;
}

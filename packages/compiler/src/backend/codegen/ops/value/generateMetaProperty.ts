import * as t from "@babel/types";
import { MetaPropertyOp } from "../../../../ir/ops/prop/MetaProperty";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateMetaPropertyOp(
  instruction: MetaPropertyOp,
  generator: CodeGenerator,
): t.Expression {
  const node = t.metaProperty(t.identifier(instruction.meta), t.identifier(instruction.property));
  generator.values.set(instruction.place.id, node);
  return node;
}

import * as t from "@babel/types";
import { MetaPropertyInstruction } from "../../../../ir/instructions/value/MetaProperty";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateMetaPropertyInstruction(
  instruction: MetaPropertyInstruction,
  generator: CodeGenerator,
): t.Expression {
  const node = t.metaProperty(t.identifier(instruction.meta), t.identifier(instruction.property));
  generator.places.set(instruction.place.id, node);
  return node;
}

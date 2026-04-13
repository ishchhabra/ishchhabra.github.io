import * as t from "@babel/types";
import { LiteralOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLiteralOp(instruction: LiteralOp, generator: CodeGenerator): t.Expression {
  const node = t.valueToNode(instruction.value);
  generator.places.set(instruction.place.id, node);
  return node;
}

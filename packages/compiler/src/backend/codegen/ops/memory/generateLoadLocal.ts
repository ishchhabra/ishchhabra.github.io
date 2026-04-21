import * as t from "@babel/types";
import { LoadLocalOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadLocalOp(
  instruction: LoadLocalOp,
  generator: CodeGenerator,
): t.Expression {
  let node = generator.values.get(instruction.value.id);
  if (!node) {
    node = generator.getPlaceIdentifier(instruction.value);
  }

  t.assertExpression(node);
  generator.values.set(instruction.place.id, node);
  return node;
}

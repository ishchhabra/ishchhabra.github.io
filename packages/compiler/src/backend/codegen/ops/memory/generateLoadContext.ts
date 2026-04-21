import * as t from "@babel/types";
import { LoadContextOp } from "../../../../ir/ops/mem/LoadContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadContextOp(
  instruction: LoadContextOp,
  generator: CodeGenerator,
): t.Expression {
  let node = generator.values.get(instruction.value.id);
  if (node === undefined || node === null) {
    node = generator.getPlaceIdentifier(instruction.value);
  }

  t.assertExpression(node);
  generator.values.set(instruction.place.id, node);
  return node;
}

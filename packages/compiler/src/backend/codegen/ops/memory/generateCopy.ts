import * as t from "@babel/types";
import { CopyOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateCopyOp(instruction: CopyOp, generator: CodeGenerator): t.Node {
  let lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    lval = generator.getPlaceIdentifier(instruction.lval);
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  if (value === undefined || value === null) {
    throw new Error(`Place ${instruction.value.id} not found for Copy value`);
  }
  t.assertExpression(value);

  const node = t.assignmentExpression("=", lval, value);
  generator.places.set(instruction.place.id, node);
  return node;
}

import * as t from "@babel/types";
import { StoreContextOp } from "../../../../ir/ops/mem/StoreContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreContextOp(
  instruction: StoreContextOp,
  generator: CodeGenerator,
): t.Statement {
  let lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    lval = generator.getPlaceIdentifier(instruction.lval);
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  t.assertExpression(value);

  if (instruction.kind === "declaration") {
    const node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
    generator.places.set(instruction.place.id, instruction.emit ? lval : node);
    return node;
  }

  // Assignment — emit `lval = value`
  const assignment = t.assignmentExpression("=", lval, value);
  const node = t.expressionStatement(assignment);
  generator.places.set(instruction.place.id, assignment);
  return node;
}

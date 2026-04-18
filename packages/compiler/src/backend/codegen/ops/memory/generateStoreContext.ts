import * as t from "@babel/types";
import { StoreContextOp } from "../../../../ir/ops/mem/StoreContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreContextOp(
  instruction: StoreContextOp,
  generator: CodeGenerator,
): t.Statement {
  let lval = generator.values.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    lval = generator.getPlaceIdentifier(instruction.lval);
  }
  t.assertLVal(lval);

  const value = generator.values.get(instruction.value.id);
  t.assertExpression(value);

  if (instruction.kind === "declaration") {
    const node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
    // Always cache the full VariableDeclaration so an export wrapper
    // that references this store via `.declaration` can read it.
    generator.values.set(instruction.place.id, node);
    return node;
  }

  // Assignment — emit `lval = value`
  const assignment = t.assignmentExpression("=", lval, value);
  const node = t.expressionStatement(assignment);
  generator.values.set(instruction.place.id, assignment);
  return node;
}

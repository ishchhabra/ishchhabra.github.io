import * as t from "@babel/types";
import { StoreLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreLocalInstruction(
  instruction: StoreLocalInstruction,
  generator: CodeGenerator,
): t.Statement {
  let lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    // Assignment target not pre-registered (no DeclareLocal). Create the
    // identifier on demand — this is the normal path for SSA-versioned
    // writes to existing bindings.
    const name = instruction.lval.identifier.name ?? `$${instruction.lval.identifier.id}`;
    lval = t.identifier(name);
    generator.places.set(instruction.lval.id, lval);
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  t.assertExpression(value);

  const declId = instruction.lval.identifier.declarationId;
  const kind = generator.declarationKinds.get(declId);
  const isFirstWrite = kind !== undefined && !generator.declaredDeclarations.has(declId);

  let node: t.Statement;
  if (isFirstWrite) {
    // First write to a declared variable — emit variable declaration.
    node = t.variableDeclaration(kind, [t.variableDeclarator(lval, value)]);
    generator.declaredDeclarations.add(declId);
  } else if (kind !== undefined) {
    // Subsequent write — emit bare assignment.
    const assignment = t.assignmentExpression("=", lval as t.LVal, value);
    node = t.expressionStatement(assignment);
  } else {
    // No DeclareLocal (internal temp) — fall back to const declaration.
    node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
  }

  generator.places.set(instruction.place.id, instruction.emit ? lval : node);
  return node;
}

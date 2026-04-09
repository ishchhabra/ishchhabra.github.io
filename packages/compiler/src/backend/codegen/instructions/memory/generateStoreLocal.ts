import * as t from "@babel/types";
import { getCodegenDeclarationKind, StoreLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateStoreLocalInstruction(
  instruction: StoreLocalInstruction,
  generator: CodeGenerator,
): t.Statement {
  let lval = generator.places.get(instruction.lval.id);
  if (lval === undefined || lval === null) {
    lval = generator.getPlaceIdentifier(instruction.lval);
  }
  t.assertLVal(lval);

  const value = generator.places.get(instruction.value.id);
  t.assertExpression(value);

  const declId = instruction.lval.identifier.declarationId;
  const metadata = generator.getDeclarationMetadata(declId);
  const kind = metadata ? getCodegenDeclarationKind(metadata.kind) : undefined;

  let node: t.Statement;
  if (instruction.kind === "declaration" && kind !== undefined) {
    node = t.variableDeclaration(kind, [t.variableDeclarator(lval, value)]);
    generator.declaredDeclarations.add(declId);
  } else if (kind !== undefined) {
    const assignment = t.assignmentExpression("=", lval as t.LVal, value);
    node = t.expressionStatement(assignment);
  } else {
    if (instruction.kind === "declaration") {
      node = t.variableDeclaration(instruction.type, [t.variableDeclarator(lval, value)]);
    } else {
      const assignment = t.assignmentExpression("=", lval as t.LVal, value);
      node = t.expressionStatement(assignment);
    }
  }

  generator.places.set(instruction.place.id, instruction.emit ? lval : node);
  return node;
}

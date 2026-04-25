import * as t from "@babel/types";
import { BindingDeclOp, BindingInitOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateBindingDeclOp(
  instruction: BindingDeclOp,
  generator: CodeGenerator,
): t.VariableDeclaration | undefined {
  const id = generator.getPlaceIdentifier(instruction.place);
  const declId = instruction.place.declarationId;
  if (generator.declaredDeclarations.has(declId)) {
    return undefined;
  }

  generator.declaredDeclarations.add(declId);
  return t.variableDeclaration(instruction.kind, [t.variableDeclarator(id)]);
}

export function generateBindingInitOp(
  instruction: BindingInitOp,
  generator: CodeGenerator,
): t.VariableDeclaration | undefined {
  const id = generator.getPlaceIdentifier(instruction.place);
  const declId = instruction.place.declarationId;
  if (generator.declaredDeclarations.has(declId)) {
    return undefined;
  }

  let value = generator.values.get(instruction.value.id);
  if (value === undefined || value === null) {
    value = generator.getPlaceIdentifier(instruction.value);
  }
  t.assertExpression(value);

  const node = t.variableDeclaration(instruction.kind, [t.variableDeclarator(id, value)]);
  generator.declaredDeclarations.add(declId);
  generator.values.set(instruction.place.id, id);
  return node;
}

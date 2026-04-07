import * as t from "@babel/types";
import { LoadLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadLocalInstruction(
  instruction: LoadLocalInstruction,
  generator: CodeGenerator,
): t.Expression {
  let maybeNode = generator.places.get(instruction.value.id);
  if (!maybeNode) {
    const name = instruction.value.identifier.name ?? `$${instruction.value.identifier.id}`;
    maybeNode = t.identifier(name);
    generator.places.set(instruction.value.id, maybeNode);
  }

  if (t.isFunctionDeclaration(maybeNode)) {
    maybeNode = maybeNode.id;
  }

  t.assertExpression(maybeNode);
  generator.places.set(instruction.place.id, maybeNode);
  return maybeNode;
}

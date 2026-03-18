import * as t from "@babel/types";
import { LoadLocalInstruction } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadLocalInstruction(
  instruction: LoadLocalInstruction,
  generator: CodeGenerator,
): t.Expression {
  const maybeNode = generator.places.get(instruction.value.id);
  if (!maybeNode) {
    throw new Error("Could not find a node for the value");
  }

  t.assertExpression(maybeNode);
  generator.places.set(instruction.place.id, maybeNode);
  return maybeNode;
}

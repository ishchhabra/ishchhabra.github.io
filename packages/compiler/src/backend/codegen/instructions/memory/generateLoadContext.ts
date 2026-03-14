import * as t from "@babel/types";
import { LoadContextInstruction } from "../../../../ir/instructions/memory/LoadContext";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateLoadContextInstruction(
  instruction: LoadContextInstruction,
  generator: CodeGenerator,
): t.Expression {
  const maybeNode = generator.places.get(instruction.value.id);
  if (!maybeNode) {
    throw new Error("Could not find a node for the value");
  }

  if (t.isLiteral(maybeNode)) {
    generator.places.set(instruction.place.id, maybeNode);
    return maybeNode;
  }

  const node = t.identifier(instruction.value.identifier.name);
  t.assertExpression(node);
  generator.places.set(instruction.place.id, node);
  return node;
}

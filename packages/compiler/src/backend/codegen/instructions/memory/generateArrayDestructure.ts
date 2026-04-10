import * as t from "@babel/types";
import { ArrayDestructureInstruction, getDestructureTargetDefs } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateDestructureTarget } from "./generateDestructureTarget";

export function generateArrayDestructureInstruction(
  instruction: ArrayDestructureInstruction,
  generator: CodeGenerator,
): t.Statement {
  const value = generator.places.get(instruction.value.id);
  if (value === undefined) {
    throw new Error(`Place ${instruction.value.id} not found`);
  }
  t.assertExpression(value);
  const pattern = t.arrayPattern(
    instruction.elements.map((element) =>
      element === null ? null : (generateDestructureTarget(element, generator) as t.PatternLike),
    ),
  );

  let node: t.Statement;
  if (instruction.kind === "declaration") {
    if (instruction.declarationKind === null) {
      throw new Error("Array destructure declarations require a declaration kind");
    }
    for (const place of getDestructureTargetDefs({
      kind: "array",
      elements: instruction.elements,
    })) {
      generator.declaredDeclarations.add(place.identifier.declarationId);
    }
    node = t.variableDeclaration(instruction.declarationKind, [
      t.variableDeclarator(pattern, value),
    ]);
  } else {
    node = t.expressionStatement(t.assignmentExpression("=", pattern, value));
  }

  generator.places.set(instruction.place.id, instruction.emit ? pattern : node);
  return node;
}

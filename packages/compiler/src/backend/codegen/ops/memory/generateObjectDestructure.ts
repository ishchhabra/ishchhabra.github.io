import * as t from "@babel/types";
import { ObjectDestructureOp, getDestructureTargetDefs } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";
import { generateDestructureTarget } from "./generateDestructureTarget";

export function generateObjectDestructureOp(
  instruction: ObjectDestructureOp,
  generator: CodeGenerator,
): t.Statement {
  const value = generator.places.get(instruction.value.id);
  if (value === undefined) {
    throw new Error(`Place ${instruction.value.id} not found`);
  }
  t.assertExpression(value);
  const pattern = t.objectPattern(
    instruction.properties.map((property) => {
      const generated = generateDestructureTarget(
        { kind: "object", properties: [property] },
        generator,
      );
      if (generated.type !== "ObjectPattern") {
        throw new Error("Expected object pattern fragment");
      }
      return generated.properties[0]!;
    }),
  );

  let node: t.Statement;
  if (instruction.kind === "declaration") {
    if (instruction.declarationKind === null) {
      throw new Error("Object destructure declarations require a declaration kind");
    }
    for (const place of getDestructureTargetDefs({
      kind: "object",
      properties: instruction.properties,
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

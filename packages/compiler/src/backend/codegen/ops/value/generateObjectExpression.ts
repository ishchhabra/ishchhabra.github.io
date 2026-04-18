import * as t from "@babel/types";
import { ObjectExpressionOp } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

export function generateObjectExpressionOp(
  instruction: ObjectExpressionOp,
  generator: CodeGenerator,
): t.ObjectExpression {
  const properties = instruction.properties.map((property) => {
    const propertyNode = generator.values.get(property.id);
    if (propertyNode === undefined) {
      throw new Error(`Value ${property.id} not found`);
    }

    if (
      !t.isObjectProperty(propertyNode) &&
      !t.isObjectMethod(propertyNode) &&
      !t.isSpreadElement(propertyNode)
    ) {
      throw new Error(`Unsupported property type: ${propertyNode?.type}`);
    }

    return propertyNode;
  });

  const node = t.objectExpression(properties);
  generator.values.set(instruction.place.id, node);
  return node;
}

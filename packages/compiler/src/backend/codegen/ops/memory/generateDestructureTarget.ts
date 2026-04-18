import * as t from "@babel/types";
import { type DestructureObjectProperty, type DestructureTarget, Value } from "../../../../ir";
import { CodeGenerator } from "../../../CodeGenerator";

type PatternLVal = t.Identifier | t.MemberExpression | t.ArrayPattern | t.ObjectPattern;

function getBindingIdentifier(place: Value, generator: CodeGenerator): t.Identifier {
  return generator.getPlaceIdentifier(place);
}

function getExpression(place: Value, generator: CodeGenerator): t.Expression {
  const node = generator.values.get(place.id);
  if (node === undefined) {
    throw new Error(`Value ${place.id} not found`);
  }
  t.assertExpression(node);
  return node;
}

function generateObjectProperty(
  property: DestructureObjectProperty,
  generator: CodeGenerator,
): t.ObjectProperty | t.RestElement {
  if (property.value.kind === "rest") {
    return t.restElement(
      generateDestructureTarget(property.value.argument, generator) as PatternLVal,
    );
  }

  const value = generateDestructureTarget(property.value, generator);
  let key: t.Expression | t.Identifier | t.PrivateName;
  if (property.computed) {
    if (!(property.key instanceof Value)) {
      throw new Error("Computed destructure key must be a place");
    }
    key = getExpression(property.key, generator);
  } else if (typeof property.key === "string" && t.isValidIdentifier(property.key, true)) {
    key = t.identifier(property.key);
  } else if (typeof property.key === "number") {
    key = t.numericLiteral(property.key);
  } else if (typeof property.key === "string") {
    key = t.stringLiteral(property.key);
  } else {
    throw new Error("Non-computed object destructure key must be string or number");
  }

  const shorthand =
    property.shorthand && t.isIdentifier(key) && t.isIdentifier(value) && key.name === value.name;

  return t.objectProperty(key, value as t.Expression | t.PatternLike, property.computed, shorthand);
}

export function generateDestructureTarget(
  target: DestructureTarget,
  generator: CodeGenerator,
): t.LVal | t.PatternLike {
  switch (target.kind) {
    case "binding":
      return getBindingIdentifier(target.place, generator);
    case "static-member": {
      const object = getExpression(target.object, generator);
      const property =
        typeof target.property === "string" && t.isValidIdentifier(String(target.property), true)
          ? t.identifier(String(target.property))
          : typeof target.property === "number"
            ? t.numericLiteral(target.property)
            : t.stringLiteral(String(target.property));
      return t.memberExpression(object, property, !t.isIdentifier(property));
    }
    case "dynamic-member":
      return t.memberExpression(
        getExpression(target.object, generator),
        getExpression(target.property, generator),
        true,
      );
    case "assignment":
      return t.assignmentPattern(
        generateDestructureTarget(target.left, generator) as PatternLVal,
        getExpression(target.right, generator),
      );
    case "rest":
      return t.restElement(generateDestructureTarget(target.argument, generator) as PatternLVal);
    case "array":
      return t.arrayPattern(
        target.elements.map((element) =>
          element === null
            ? null
            : (generateDestructureTarget(element, generator) as t.PatternLike),
        ),
      );
    case "object":
      return t.objectPattern(
        target.properties.map((property) => generateObjectProperty(property, generator)),
      );
  }
}

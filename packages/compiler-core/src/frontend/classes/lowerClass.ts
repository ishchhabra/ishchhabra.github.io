import type {
  Class,
  ClassElement as OxcClassElement,
  Expression,
  Function as OxcFunction,
  PrivateIdentifier,
  PropertyDefinition,
  PropertyKey as OxcPropertyKey,
} from "oxc-parser";

import type { FunctionIR } from "../../ir/core/FunctionIR";
import type { Value } from "../../ir/core/Value";
import {
  CreateClassOp,
  type ClassElement,
  type ClassElementKey,
} from "../../ir/ops/classes/CreateClassOp";
import type { PropertyKey } from "../../ir/ops/properties/PropertyKey";
import { lowerExpression } from "../expressions/lowerExpression";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { lowerDeferredExpression } from "../functions/lowerDeferredExpression";
import { lowerFunctionBody } from "../functions/lowerFunctionBody";

export function lowerClass(builder: FunctionIRBuilder, classNode: Class): Value {
  if ((classNode.decorators?.length ?? 0) > 0) {
    throw new Error("Class decorators are not supported");
  }

  const superClass =
    classNode.superClass === null ? null : lowerExpression(builder, classNode.superClass);
  const elements = classNode.body.body.map((element) => lowerClassElement(builder, element));
  const result = builder.createValue();

  builder.emit(
    new CreateClassOp(
      builder.operationId(),
      classNode.type === "ClassExpression" && classNode.id !== null
        ? builder.declarationForBinding(classNode.id).id
        : null,
      superClass,
      elements,
      result,
    ),
  );

  return result;
}

function lowerClassElement(builder: FunctionIRBuilder, element: OxcClassElement): ClassElement {
  switch (element.type) {
    case "MethodDefinition":
      return {
        kind: "method",
        methodKind: element.kind,
        placement: element.static ? "static" : "prototype",
        key: lowerClassElementKey(builder, element.key, element.computed),
        functionIR: lowerClassElementFunction(builder, element.value, element.kind),
        captures: [],
      };

    case "PropertyDefinition":
      return lowerClassField(builder, element);

    case "AccessorProperty":
      throw new Error("Class auto-accessors require accessor lowering");

    case "StaticBlock":
      throw new Error("Static blocks require static block lowering");
  }

  throw new Error(`Unsupported class element: ${element.type}`);
}

function lowerClassField(builder: FunctionIRBuilder, element: PropertyDefinition): ClassElement {
  if ((element.decorators?.length ?? 0) > 0) {
    throw new Error("Class field decorators are not supported");
  }

  return {
    kind: "field",
    placement: element.static ? "static" : "instance",
    key: lowerClassElementKey(builder, element.key, element.computed),
    initializer:
      element.value === null
        ? null
        : lowerDeferredExpression(builder, element.value, "class-field-initializer"),
    captures: [],
  };
}

function lowerClassElementFunction(
  builder: FunctionIRBuilder,
  value: OxcFunction,
  kind: "constructor" | "method" | "get" | "set",
): FunctionIR {
  const captures = builder.capturesForOwner(value);
  const nested = builder.createNestedFunctionIR({
    kind: kind === "constructor" ? "class-constructor" : "class-method",
    isAsync: value.async,
    isGenerator: value.generator,
    captures,
  });

  lowerFunctionBody(nested.builder, value);
  return nested.functionIR;
}

function lowerClassElementKey(
  builder: FunctionIRBuilder,
  key: OxcPropertyKey,
  computed: boolean,
): ClassElementKey {
  if (key.type === "PrivateIdentifier") {
    return { kind: "private", name: builder.privateNameFor(key) };
  }

  return {
    kind: "public",
    key: lowerPublicClassElementKey(builder, key, computed),
  };
}

function lowerPublicClassElementKey(
  builder: FunctionIRBuilder,
  key: Exclude<OxcPropertyKey, PrivateIdentifier>,
  computed: boolean,
): PropertyKey {
  if (computed) {
    return {
      kind: "computed",
      value: lowerExpression(builder, expressionPropertyKey(key)),
    };
  }

  switch (key.type) {
    case "Identifier":
      return { kind: "static", name: key.name };

    case "Literal":
      return { kind: "static", name: String(key.value) };

    default:
      throw new Error(`Unsupported class element key: ${key.type}`);
  }
}

function expressionPropertyKey(
  key: OxcPropertyKey,
): Exclude<OxcPropertyKey, PrivateIdentifier> & Expression {
  if (key.type === "PrivateIdentifier") {
    throw new Error("Private class elements require private-name lowering");
  }

  return key;
}

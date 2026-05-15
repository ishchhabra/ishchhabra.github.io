import type {
  ClassElement,
  ClassFieldElement,
  ClassMethodElement,
  CreateClassOp,
} from "../../../../ir/ops/classes/CreateClassOp";
import {
  classExpression,
  identifier,
  literal,
  methodDefinition,
  privateIdentifier,
  propertyDefinition,
  type ClassElementNode,
  type ESTreeExpression,
  type ESTreeStatement,
  type PrivateIdentifierNode,
  type ReturnStatementNode,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitFunctionBody, emitFunctionExpression } from "../../functions/emitFunction";

export function emitCreateClassOp(context: CodegenContext, op: CreateClassOp): ESTreeStatement[] {
  const expression = classExpression(
    op.selfBindingDeclarationId === null
      ? null
      : identifier(context.names.declarationName(op.selfBindingDeclarationId)),
    op.superClass === null ? null : context.expressionForValue(op.superClass),
    op.elements.map((element) => emitClassElement(context, element)),
  );

  context.values.set(op.result, expression);
  return [];
}

function emitClassElement(context: CodegenContext, element: ClassElement): ClassElementNode {
  switch (element.kind) {
    case "method":
      return emitClassMethod(context, element);

    case "field":
      return emitClassField(context, element);
  }
}

function emitClassMethod(context: CodegenContext, element: ClassMethodElement): ClassElementNode {
  const key = emitPropertyKey(context, element.key);
  const value = emitFunctionExpression(context, element.functionIR);

  if (value.type !== "FunctionExpression") {
    throw new Error("Class method body must emit as a function expression");
  }

  return methodDefinition(element.methodKind, key.expression, value, {
    static: element.placement === "static",
    computed: key.computed,
  });
}

function emitClassField(context: CodegenContext, element: ClassFieldElement): ClassElementNode {
  const key = emitPropertyKey(context, element.key);

  return propertyDefinition(key.expression, emitClassFieldInitializer(context, element), {
    static: element.placement === "static",
    computed: key.computed,
  });
}

function emitClassFieldInitializer(
  context: CodegenContext,
  element: ClassFieldElement,
): ESTreeExpression | null {
  if (element.initializer === null) return null;

  const body = emitFunctionBody(context, element.initializer);
  if (body.length !== 1 || body[0].type !== "ReturnStatement") {
    throw new Error("Class field initializer must emit one return statement");
  }

  const argument = (body[0] as ReturnStatementNode).argument;
  if (argument === null) {
    throw new Error("Class field initializer returned no value");
  }

  return argument;
}

function emitPropertyKey(
  context: CodegenContext,
  key: ClassMethodElement["key"],
): {
  readonly expression: ESTreeExpression | PrivateIdentifierNode;
  readonly computed: boolean;
} {
  if (key.kind === "private") {
    return {
      expression: privateIdentifier(key.name.name),
      computed: false,
    };
  }

  if (key.key.kind === "computed") {
    return {
      expression: context.expressionForValue(key.key.value),
      computed: true,
    };
  }

  return {
    expression: isIdentifierName(key.key.name) ? identifier(key.key.name) : literal(key.key.name),
    computed: false,
  };
}

function isIdentifierName(name: string): boolean {
  return /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(name);
}

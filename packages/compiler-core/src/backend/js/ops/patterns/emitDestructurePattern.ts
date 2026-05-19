import type {
  AssignmentPatternTarget,
  BindingPatternTarget,
  ObjectAssignmentProperty,
  ObjectBindingProperty,
  PatternExpression,
  PatternPropertyKey,
} from "../../../../ir/core/DestructurePattern";
import type { DeclarationId } from "../../../../ir/core/Value";
import {
  arrayPattern,
  assignmentPattern,
  arrowFunctionExpression,
  callExpression,
  identifier,
  literal,
  memberExpression,
  objectPattern,
  objectPatternProperty,
  returnStatement,
  restElement,
  type ESTreeExpression,
  type ESTreePattern,
  type ReturnStatementNode,
  type VariableDeclarationKind,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";
import { emitFunctionBody, expressionWithStatements } from "../../functions/emitFunction";

export function emitBindingPatternTarget(
  context: CodegenContext,
  target: BindingPatternTarget,
): ESTreePattern {
  switch (target.kind) {
    case "binding":
      return identifier(context.names.declarationName(target.declarationId));

    case "array":
      return arrayPattern(
        target.elements.map((element) =>
          element === null ? null : emitBindingPatternTarget(context, element),
        ),
      );

    case "object":
      return objectPattern(
        target.properties.map((property) => emitObjectBindingProperty(context, property)),
      );

    case "rest":
      return restElement(emitBindingPatternTarget(context, target.target));

    case "default":
      return assignmentPattern(
        emitBindingPatternTarget(context, target.target),
        emitPatternExpression(context, target.expression),
      );
  }
}

export function emitAssignmentPatternTarget(
  context: CodegenContext,
  target: AssignmentPatternTarget,
): ESTreePattern {
  switch (target.kind) {
    case "binding":
      return identifier(context.names.declarationName(target.declarationId));

    case "static-property":
      return memberExpression(
        context.expressionForValue(target.object),
        identifier(target.key),
        false,
      );

    case "dynamic-property":
      return memberExpression(
        context.expressionForValue(target.object),
        context.expressionForValue(target.key),
        true,
      );

    case "array":
      return arrayPattern(
        target.elements.map((element) =>
          element === null ? null : emitAssignmentPatternTarget(context, element),
        ),
      );

    case "object":
      return objectPattern(
        target.properties.map((property) => emitObjectAssignmentProperty(context, property)),
      );

    case "rest":
      return restElement(emitAssignmentPatternTarget(context, target.target));

    case "default":
      return assignmentPattern(
        emitAssignmentPatternTarget(context, target.target),
        emitPatternExpression(context, target.expression),
      );
  }
}

export function bindingPatternDeclarationIds(target: BindingPatternTarget): DeclarationId[] {
  switch (target.kind) {
    case "binding":
      return [target.declarationId];

    case "array":
      return target.elements.flatMap((element) =>
        element === null ? [] : bindingPatternDeclarationIds(element),
      );

    case "object":
      return target.properties.flatMap((property) => bindingPatternDeclarationIds(property.target));

    case "rest":
      return bindingPatternDeclarationIds(target.target);

    case "default":
      return bindingPatternDeclarationIds(target.target);
  }
}

export function bindingPatternDeclarationKind(
  context: CodegenContext,
  target: BindingPatternTarget,
): VariableDeclarationKind {
  const ids = bindingPatternDeclarationIds(target);
  if (ids.length === 0) {
    throw new Error("Binding pattern has no declarations");
  }

  const kind = declarationVariableKind(context, ids[0]);
  for (const id of ids.slice(1)) {
    const nextKind = declarationVariableKind(context, id);
    if (nextKind !== kind) {
      throw new Error("Binding pattern contains mixed declaration kinds");
    }
  }

  return kind;
}

function emitObjectBindingProperty(context: CodegenContext, property: ObjectBindingProperty) {
  if (property.kind === "rest") {
    return restElement(emitBindingPatternTarget(context, property.target));
  }

  const key = emitPropertyKey(context, property.key);
  const value = emitBindingPatternTarget(context, property.target);

  return objectPatternProperty(
    key.expression,
    value,
    key.computed,
    isShorthandProperty(key.expression, value, key.computed),
  );
}

function emitObjectAssignmentProperty(context: CodegenContext, property: ObjectAssignmentProperty) {
  if (property.kind === "rest") {
    return restElement(emitAssignmentPatternTarget(context, property.target));
  }

  const key = emitPropertyKey(context, property.key);
  const value = emitAssignmentPatternTarget(context, property.target);

  return objectPatternProperty(
    key.expression,
    value,
    key.computed,
    isShorthandProperty(key.expression, value, key.computed),
  );
}

function emitPropertyKey(
  context: CodegenContext,
  key: PatternPropertyKey,
): { readonly expression: ESTreeExpression; readonly computed: boolean } {
  if (key.kind === "computed") {
    return {
      expression: emitPatternExpression(context, key.expression),
      computed: true,
    };
  }

  return {
    expression: isIdentifierName(key.name) ? identifier(key.name) : literal(key.name),
    computed: false,
  };
}

function emitPatternExpression(
  context: CodegenContext,
  expression: PatternExpression,
): ESTreeExpression {
  if (expression.kind === "value") return context.expressionForValue(expression.value);

  const body = emitFunctionBody(context, expression.functionIR);
  const last = body.at(-1);
  if (last?.type !== "ReturnStatement") {
    throw new Error("Pattern expression must emit a trailing return statement");
  }

  const argument = (last as ReturnStatementNode).argument;
  if (argument === null) {
    throw new Error("Pattern expression returned no value");
  }

  const statements = body.slice(0, -1);
  if (statements.every((statement) => statement.type === "ExpressionStatement")) {
    return expressionWithStatements(statements, argument);
  }

  return callExpression(
    arrowFunctionExpression([], [...statements, returnStatement(argument)]),
    [],
  );
}

function declarationVariableKind(
  context: CodegenContext,
  id: DeclarationId,
): VariableDeclarationKind {
  const declaration = context.declaration(id);
  if (declaration.kind === "var") return "var";

  if (declaration.kind === "lexical") {
    return declaration.mode === "const" ? "const" : "let";
  }

  if (declaration.kind === "catch-parameter" || declaration.kind === "parameter") {
    return "let";
  }

  throw new Error(`Cannot emit declaration pattern for ${declaration.kind} declaration`);
}

function isShorthandProperty(
  key: ESTreeExpression,
  value: ESTreePattern,
  computed: boolean,
): boolean {
  return (
    !computed && key.type === "Identifier" && value.type === "Identifier" && key.name === value.name
  );
}

function isIdentifierName(name: string): boolean {
  return /^[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*$/u.test(name);
}

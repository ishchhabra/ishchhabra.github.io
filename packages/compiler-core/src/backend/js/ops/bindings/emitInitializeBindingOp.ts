import type { InitializeBindingOp } from "../../../../ir/ops/bindings/InitializeBindingOp";
import {
  classDeclaration,
  functionDeclaration,
  identifier,
  variableDeclaration,
  type ESTreeStatement,
} from "../../ast";
import type { CodegenContext } from "../../CodegenContext";

export function emitInitializeBindingOp(
  context: CodegenContext,
  op: InitializeBindingOp,
): ESTreeStatement[] {
  if (context.declaredDeclarations.has(op.declarationId)) return [];

  const declaration = context.declaration(op.declarationId);
  const name = context.names.declarationName(op.declarationId);
  context.values.set(op.bindingValue, identifier(name));
  const value = context.expressionForValue(op.value);

  context.declaredDeclarations.add(op.declarationId);

  if (declaration.kind === "function") {
    if (value.type !== "FunctionExpression") {
      throw new Error(
        `Function declaration ${name} must be initialized with a function expression`,
      );
    }

    return [
      functionDeclaration(identifier(name), value.params, value.body.body, {
        async: value.async,
        generator: value.generator,
      }),
    ];
  }

  if (declaration.kind === "lexical" && declaration.mode === "class") {
    if (value.type !== "ClassExpression") {
      throw new Error(`Class declaration ${name} must be initialized with a class expression`);
    }

    return [classDeclaration(identifier(name), value.superClass, value.body.body)];
  }

  return [
    variableDeclaration(
      declaration.kind === "var"
        ? "var"
        : declaration.kind === "lexical" && declaration.mode === "const"
          ? "const"
          : "let",
      identifier(name),
      value,
    ),
  ];
}

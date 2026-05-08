import type { VariableDeclaration, VariableDeclarator } from "oxc-parser";
import type { FunctionIRBuilder } from "../FunctionIRBuilder";
import { StoreBindingOp } from "../../ir/ops/bindings/StoreBindingOp";
import { InitializeBindingOp } from "../../ir/ops/bindings/InitializeBindingOp";
import { lowerExpression } from "../expressions/lowerExpression";
import type { Value } from "../../ir/core/Value";
import { ConstantOp } from "../../ir/ops/constants/ConstantOp";
import type { BindingIdentifierNode } from "../ast/types";
import { DestructureBindingOp } from "../../ir/ops/patterns/DestructureBindingOp";
import { lowerBindingPatternTarget } from "../patterns/lowerBindingPatternTarget";

/**
 * Lowers declaration syntax.
 *
 * Declaration instantiation creates bindings before this point. This lowering
 * handles the runtime work performed when execution reaches the declaration.
 */
export function lowerVariableDeclaration(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
): void {
  for (const declarator of declaration.declarations) {
    lowerVariableDeclarator(builder, declaration, declarator);
  }
}

function lowerVariableDeclarator(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
  declarator: VariableDeclarator,
): void {
  const initializer = initializerValue(builder, declaration, declarator);

  if (initializer === null) return;

  if (declarator.id.type !== "Identifier") {
    builder.emit(
      new DestructureBindingOp(
        builder.operationId(),
        lowerBindingPatternTarget(builder, declarator.id),
        initializer,
        declaration.kind === "var" ? "store" : "initialize",
      ),
    );
    return;
  }

  const declarationRecord = builder.declarationForBinding(declarator.id);

  if (declaration.kind === "var") {
    builder.emit(
      new StoreBindingOp(
        builder.operationId(),
        declarationRecord.id,
        initializer,
        builder.createValue(declarationRecord.id),
      ),
    );
    return;
  }

  builder.emit(
    new InitializeBindingOp(
      builder.operationId(),
      declarationRecord.id,
      initializer,
      builder.createValue(declarationRecord.id),
    ),
  );
}

function initializerValue(
  builder: FunctionIRBuilder,
  declaration: VariableDeclaration,
  declarator: VariableDeclarator,
): Value | null {
  if (declarator.init !== null) {
    return lowerExpression(builder, declarator.init);
  }

  if (declaration.kind === "var") {
    return null;
  }

  if (declaration.kind === "const") {
    throw new Error(
      `Const declaration ${declaratorName(declarator)} requires an initializer`,
    );
  }

  if (declaration.kind !== "let") {
    throw new Error(`Unsupported declaration kind: ${declaration.kind}`);
  }

  return emitUndefined(builder);
}

function emitUndefined(builder: FunctionIRBuilder): Value {
  const result = builder.createValue();
  builder.emit(new ConstantOp(builder.operationId(), undefined, result));
  return result;
}

function bindingName(binding: BindingIdentifierNode): string {
  return binding.name;
}

function declaratorName(declarator: VariableDeclarator): string {
  return declarator.id.type === "Identifier"
    ? bindingName(declarator.id)
    : "pattern";
}

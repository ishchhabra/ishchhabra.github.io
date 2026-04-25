import type * as AST from "../../estree";
import type { Node, VariableDeclaration } from "oxc-parser";
import { Environment } from "../../../environment";
import { BindingDeclOp, type DeclarationKind, LiteralOp, StoreLocalOp } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildVariableDeclarationBindings(
  scope: Scope,
  node: VariableDeclaration,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  if (node.kind !== "var" && node.kind !== "let" && node.kind !== "const") {
    throw new Error(`Unsupported variable declaration kind: ${node.kind}`);
  }

  for (const declarator of node.declarations) {
    buildLValBindings(scope, declarator.id, node.kind, functionBuilder, environment);
  }
}

function buildLValBindings(
  scope: Scope,
  node: AST.Pattern | AST.Property,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  switch (node.type) {
    case "Identifier":
      buildIdentifierBindings(scope, node, declarationKind, functionBuilder, environment);
      break;
    case "ArrayPattern":
      buildArrayPatternBindings(scope, node, declarationKind, functionBuilder, environment);
      break;
    case "AssignmentPattern":
      buildAssignmentPatternBindings(scope, node, declarationKind, functionBuilder, environment);
      break;
    case "ObjectPattern":
      buildObjectPatternBindings(scope, node, declarationKind, functionBuilder, environment);
      break;
    case "Property":
      buildObjectPropertyBindings(scope, node, declarationKind, functionBuilder, environment);
      break;
    case "RestElement":
      buildRestElementBindings(scope, node, declarationKind, functionBuilder, environment);
      break;
    default:
      throw new Error(`Unsupported LVal type: ${(node as Node).type}`);
  }
}

function buildIdentifierBindings(
  scope: Scope,
  node: AST.Value,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const originalName = node.name;
  const binding = scope.getBinding(originalName);
  if (!isBindingOwnedByScope(scope, binding)) {
    return;
  }

  // Skip if already registered in this scope. Each declaration is visited
  // exactly once per owning scope via the precomputed inventories, but
  // duplicate `var x` in the same function still needs deduplication.
  if (scope.data.get(originalName) !== undefined) return;

  const identifier = environment.createValue();
  functionBuilder.registerDeclarationName(originalName, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(
    identifier.declarationId,
    declarationKind,
    originalName,
    scope,
  );

  // Mark context variables so SSA can skip them.
  if (binding && isContextVariable(binding, scope)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  const place = identifier;
  environment.registerDeclaration(identifier.declarationId, functionBuilder.currentBlock.id, place);
  environment.setDeclarationBinding(identifier.declarationId, place);

  // Preserve `var`'s hoisted-and-initialized semantics in the emitted JS.
  // Reifying this as `let` would introduce TDZ behavior and break both
  // source-level hoisting and ES module circular import semantics.
  if (declarationKind === "var") {
    const undefPlace = environment.createValue();
    functionBuilder.addOp(environment.createOperation(LiteralOp, undefPlace, undefined));
    functionBuilder.addOp(environment.createOperation(BindingDeclOp, place, "var"));
    const storePlace = environment.createValue();
    functionBuilder.addOp(
      environment.createOperation(StoreLocalOp, storePlace, place, undefPlace, []),
    );
  }
}

function buildArrayPatternBindings(
  scope: Scope,
  node: AST.ArrayPattern,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  for (const element of node.elements) {
    if (element == null) {
      continue;
    }

    buildLValBindings(scope, element, declarationKind, functionBuilder, environment);
  }
}

function buildAssignmentPatternBindings(
  scope: Scope,
  node: AST.AssignmentPattern,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  buildLValBindings(scope, node.left, declarationKind, functionBuilder, environment);
}

function buildObjectPatternBindings(
  scope: Scope,
  node: AST.ObjectPattern,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  for (const property of node.properties) {
    buildLValBindings(scope, property, declarationKind, functionBuilder, environment);
  }
}

function buildObjectPropertyBindings(
  scope: Scope,
  node: AST.Property,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  const value = node.value;
  if (
    value.type !== "Identifier" &&
    value.type !== "ArrayPattern" &&
    value.type !== "ObjectPattern" &&
    value.type !== "AssignmentPattern"
  ) {
    throw new Error(`Unsupported property value type: ${value.type}`);
  }

  buildLValBindings(scope, value as AST.Pattern, declarationKind, functionBuilder, environment);
}

function buildRestElementBindings(
  scope: Scope,
  node: AST.RestElement,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FuncOpBuilder,
  environment: Environment,
) {
  buildLValBindings(scope, node.argument, declarationKind, functionBuilder, environment);
}

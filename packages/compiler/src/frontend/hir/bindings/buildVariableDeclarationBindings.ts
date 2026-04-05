import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction, LiteralInstruction, StoreLocalInstruction } from "../../../ir";
import { type Scope } from "../../scope/Scope";
import { DeclarationKind, FunctionIRBuilder } from "../FunctionIRBuilder";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

export function buildVariableDeclarationBindings(
  scope: Scope,
  node: ESTree.VariableDeclaration,
  functionBuilder: FunctionIRBuilder,
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
  node: ESTree.Pattern | ESTree.Property,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
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
      throw new Error(`Unsupported LVal type: ${(node as ESTree.Node).type}`);
  }
}

function buildIdentifierBindings(
  scope: Scope,
  node: ESTree.Identifier,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const originalName = node.name;
  const binding = scope.getBinding(originalName);
  if (!isBindingOwnedByScope(scope, binding)) {
    return;
  }

  // Skip if already registered in the enclosing function (or program)
  // scope -- for example, a hoisted `var` instantiated when entering the
  // parent function/program scope.
  // Check this scope's own data directly rather than using getData()
  // which walks the entire scope chain and would incorrectly match a
  // same-named declaration from an enclosing function.
  const functionScope =
    scope.kind === "function" || scope.kind === "program"
      ? scope
      : (scope.getFunctionParent() ?? scope.getProgramParent());
  if (functionScope.data.get(originalName) !== undefined) return;

  const identifier = environment.createIdentifier();
  functionBuilder.registerDeclarationName(originalName, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(identifier.declarationId, declarationKind, originalName);

  // Mark context variables so SSA can skip them.
  if (binding && isContextVariable(binding, scope)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  const place = environment.createPlace(identifier);
  environment.registerDeclaration(
    identifier.declarationId,
    functionBuilder.currentBlock.id,
    place.id,
  );

  // Emit hoisted `let <binding> = undefined` for var declarations.
  // The compiler already hoists the declaration to the correct scope,
  // so we use `let` (not `var`) to avoid re-introducing JS hoisting
  // semantics in the output.
  if (binding?.kind === "var") {
    const hoistId = environment.createIdentifier(identifier.declarationId);
    hoistId.name = identifier.name;
    const hoistPlace = environment.createPlace(hoistId);
    functionBuilder.addInstruction(
      environment.createInstruction(DeclareLocalInstruction, hoistPlace, "let"),
    );
    const undefPlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(LiteralInstruction, undefPlace, undefined),
    );
    const storePlace = environment.createPlace(environment.createIdentifier());
    functionBuilder.addInstruction(
      environment.createInstruction(
        StoreLocalInstruction,
        storePlace,
        hoistPlace,
        undefPlace,
        "let",
        [],
      ),
    );
    environment.registerDeclaration(
      identifier.declarationId,
      functionBuilder.currentBlock.id,
      hoistPlace.id,
    );
  }
}

function buildArrayPatternBindings(
  scope: Scope,
  node: ESTree.ArrayPattern,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
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
  node: ESTree.AssignmentPattern,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  buildLValBindings(scope, node.left, declarationKind, functionBuilder, environment);
}

function buildObjectPatternBindings(
  scope: Scope,
  node: ESTree.ObjectPattern,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  for (const property of node.properties) {
    buildLValBindings(scope, property, declarationKind, functionBuilder, environment);
  }
}

function buildObjectPropertyBindings(
  scope: Scope,
  node: ESTree.Property,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const value = node.value;
  if (
    value.type !== "Identifier" &&
    value.type !== "ArrayPattern" &&
    value.type !== "ObjectPattern" &&
    value.type !== "AssignmentPattern" &&
    value.type !== "RestElement"
  ) {
    throw new Error(`Unsupported property value type: ${value.type}`);
  }

  buildLValBindings(scope, value as ESTree.Pattern, declarationKind, functionBuilder, environment);
}

function buildRestElementBindings(
  scope: Scope,
  node: ESTree.RestElement,
  declarationKind: Extract<DeclarationKind, "var" | "let" | "const">,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  buildLValBindings(scope, node.argument, declarationKind, functionBuilder, environment);
}

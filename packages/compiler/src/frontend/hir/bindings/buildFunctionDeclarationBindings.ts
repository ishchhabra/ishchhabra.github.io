import type * as ESTree from "estree";
import { Environment } from "../../../environment";
import { DeclareLocalInstruction, StoreLocalInstruction } from "../../../ir";
import { FunctionExpressionInstruction } from "../../../ir/instructions/value/FunctionExpression";
import { type Scope, type ScopeMap } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

/**
 * Phase 1: Register the function declaration binding in the scope.
 * Creates the binding identity and emits a DeclareLocal instruction,
 * but does NOT build the function body yet.
 */
export function registerFunctionDeclarationBinding(
  scope: Scope,
  scopeMap: ScopeMap,
  node: ESTree.FunctionDeclaration,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
) {
  const functionName = node.id;
  if (functionName == null || functionName.type !== "Identifier") {
    return;
  }

  // Function declarations create their own inner scope, but the binding
  // is owned by the enclosing scope.
  const binding = scope.getBinding(functionName.name);
  if (!isBindingOwnedByScope(scope, binding)) {
    return;
  }

  const identifier = environment.createIdentifier(undefined, scope.allocateName());
  functionBuilder.registerDeclarationName(functionName.name, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(identifier.declarationId, "function", functionName.name);

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
  functionBuilder.addInstruction(
    environment.createInstruction(DeclareLocalInstruction, place, "const"),
  );
}

/**
 * Phase 2: Build the function body and emit a FunctionExpressionInstruction + StoreLocal.
 * Per ECMA-262 ss.10.2.11, InstantiateFunctionObject runs after ALL bindings in
 * the scope have been created, so this must be called after all register*
 * functions have completed.
 */
export function initializeFunctionDeclaration(
  scope: Scope,
  scopeMap: ScopeMap,
  node: ESTree.FunctionDeclaration,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  const functionName = node.id;
  if (functionName == null || functionName.type !== "Identifier") {
    return;
  }

  const binding = scope.getBinding(functionName.name);
  if (!isBindingOwnedByScope(scope, binding)) {
    return;
  }

  const declarationId = functionBuilder.getDeclarationId(functionName.name, scope);
  if (declarationId === undefined) {
    throw new Error(`Function declaration binding was not registered: ${functionName.name}`);
  }

  const latestDeclaration = environment.getLatestDeclaration(declarationId);
  const identifierPlace = environment.places.get(latestDeclaration.placeId);
  if (identifierPlace === undefined) {
    throw new Error(`Unable to find the place for ${functionName.name} (${declarationId})`);
  }

  const params = node.params;
  const body = node.body;
  const fnScope = scopeMap.get(node) ?? scope;
  const functionIRBuilder = new FunctionIRBuilder(
    params,
    node,
    body,
    fnScope,
    scopeMap,
    functionBuilder.environment,
    moduleBuilder,
    node.async ?? false,
    node.generator ?? false,
  );
  const functionIR = functionIRBuilder.build();

  functionBuilder.propagateCapturesFrom(functionIRBuilder);
  const capturedPlaces = [...functionIRBuilder.captures.values()];

  const fnPlace = environment.createPlace(environment.createIdentifier(declarationId));
  const instruction = environment.createInstruction(
    FunctionExpressionInstruction,
    fnPlace,
    identifierPlace,
    functionIR,
    node.generator ?? false,
    node.async ?? false,
    capturedPlaces,
  );
  functionBuilder.addInstruction(instruction);
  environment.registerDeclarationInstruction(fnPlace, instruction);

  const isContext = environment.contextDeclarationIds.has(declarationId);
  const storePlace = environment.createPlace(environment.createIdentifier());
  functionBuilder.addInstruction(
    environment.createInstruction(
      StoreLocalInstruction,
      storePlace,
      identifierPlace,
      fnPlace,
      isContext ? ("let" as const) : ("const" as const),
      [],
    ),
  );
}

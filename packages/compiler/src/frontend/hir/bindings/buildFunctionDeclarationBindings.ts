import type { Function } from "oxc-parser";
import { Environment } from "../../../environment";
import { FunctionDeclarationOp } from "../../../ir/ops/func/FunctionDeclaration";
import { type Scope, type ScopeMap } from "../../scope/Scope";
import { FuncOpBuilder } from "../FuncOpBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { isBindingOwnedByScope } from "./isBindingOwnedByScope";
import { isContextVariable } from "./isContextVariable";

/**
 * Phase 1: Register the function declaration binding in the scope.
 * Creates the binding identity and binding place, but does NOT build
 * the function body yet.
 */
export function registerFunctionDeclarationBinding(
  scope: Scope,
  _scopeMap: ScopeMap,
  node: Function,
  functionBuilder: FuncOpBuilder,
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

  const identifier = environment.createValue();
  functionBuilder.registerDeclarationName(functionName.name, identifier.declarationId, scope);
  functionBuilder.instantiateDeclaration(
    identifier.declarationId,
    "function",
    functionName.name,
    scope,
  );

  // Mark context variables so SSA can skip them.
  if (binding && isContextVariable(binding, scope)) {
    environment.contextDeclarationIds.add(identifier.declarationId);
  }

  const place = identifier;
  environment.registerDeclaration(identifier.declarationId, functionBuilder.currentBlock.id, place);
  environment.setDeclarationBinding(identifier.declarationId, place);
}

/**
 * Phase 2: Build the function body and emit a dedicated FunctionDeclarationOp.
 * Per ECMA-262 ss.10.2.11, InstantiateFunctionObject runs after ALL bindings in
 * the scope have been created, so this must be called after all register*
 * functions have completed.
 */
export function initializeFunctionDeclaration(
  scope: Scope,
  scopeMap: ScopeMap,
  node: Function,
  functionBuilder: FuncOpBuilder,
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
  const identifierPlace = latestDeclaration.value;
  if (identifierPlace === undefined) {
    throw new Error(`Unable to find the place for ${functionName.name} (${declarationId})`);
  }

  const params = node.params;
  const body = node.body;
  if (body == null) {
    throw new Error("Function declarations must have a body");
  }
  const fnScope = scopeMap.get(node) ?? scope;
  const funcOpBuilder = new FuncOpBuilder(
    params,
    body,
    fnScope,
    scopeMap,
    functionBuilder.environment,
    moduleBuilder,
    node.async ?? false,
    node.generator ?? false,
    functionBuilder.funcOpId,
  );
  const funcOp = funcOpBuilder.build();

  functionBuilder.propagateCapturesFrom(funcOpBuilder);
  const capturedPlaces = [...funcOpBuilder.captures.values()];

  const instruction = environment.createOperation(
    FunctionDeclarationOp,
    identifierPlace,
    funcOp,
    node.generator ?? false,
    node.async ?? false,
    capturedPlaces,
  );
  functionBuilder.addOp(instruction);
}

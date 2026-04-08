import type { Node } from "oxc-parser";
import { Environment } from "../../../environment";
import { type Scope } from "../../scope/Scope";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildClassDeclarationBindings } from "./buildClassDeclarationBindings";
import {
  initializeFunctionDeclaration,
  registerFunctionDeclarationBinding,
} from "./buildFunctionDeclarationBindings";
import { buildVariableDeclarationBindings } from "./buildVariableDeclarationBindings";

/**
 * Instantiates all bindings owned by the current scope before the
 * scope body is lowered, using the precomputed declaration inventories
 * built during scope analysis.
 *
 * This mirrors the ECMA-262 instantiation procedures:
 *
 * - **FunctionDeclarationInstantiation** (§10.2.11): For function/program
 *   scopes — instantiate functions (in spec order, last-wins), then vars,
 *   then lexical declarations.
 *
 * - **BlockDeclarationInstantiation** (§14.2.2): For block/switch/loop
 *   scopes — instantiate lexical declarations, class declarations, and
 *   block-scoped function declarations only.
 *
 * Per §10.2.11, function bodies are built (InstantiateFunctionObject) after
 * ALL bindings in the scope have been created, so function bodies can
 * reference any binding regardless of source order.
 */
export function instantiateScopeBindings(
  _bodyNode: Node,
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  if (scope.kind === "function" || scope.kind === "program") {
    instantiateFunctionScope(scope, functionBuilder, environment, moduleBuilder);
  } else {
    instantiateBlockScope(scope, functionBuilder, environment, moduleBuilder);
  }
}

/**
 * FunctionDeclarationInstantiation (§10.2.11):
 *   1. Register function bindings (spec order — last declaration of each name wins)
 *   2. Register var bindings
 *   3. Register lexical (let/const) and class bindings
 *   4. InstantiateFunctionObject for each function declaration
 */
function instantiateFunctionScope(
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  // Step 1: Register function declaration bindings.
  for (const { node } of scope.functionsToInitialize) {
    registerFunctionDeclarationBinding(
      scope,
      functionBuilder.scopeMap,
      node,
      functionBuilder,
      environment,
    );
  }

  // Step 2: Register var bindings.
  for (const { node } of scope.varDeclarations) {
    buildVariableDeclarationBindings(scope, node, functionBuilder, environment);
  }

  // Step 3: Register lexical (let/const) and class bindings.
  for (const { node } of scope.lexicalDeclarations) {
    buildVariableDeclarationBindings(scope, node, functionBuilder, environment);
  }
  for (const { node } of scope.classDeclarations) {
    buildClassDeclarationBindings(scope, node, functionBuilder, environment);
  }

  // Step 4: InstantiateFunctionObject — build function bodies now that
  // all bindings exist and can be resolved.
  for (const { node } of scope.functionsToInitialize) {
    initializeFunctionDeclaration(
      scope,
      functionBuilder.scopeMap,
      node,
      functionBuilder,
      environment,
      moduleBuilder,
    );
  }
}

/**
 * BlockDeclarationInstantiation (§14.2.2):
 *   1. Register block-scoped function declaration bindings
 *   2. Register lexical (let/const) and class bindings
 *   3. InstantiateFunctionObject for block-scoped function declarations
 */
function instantiateBlockScope(
  scope: Scope,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  // Step 1: Register block-scoped function declarations.
  for (const { node } of scope.functionsToInitialize) {
    registerFunctionDeclarationBinding(
      scope,
      functionBuilder.scopeMap,
      node,
      functionBuilder,
      environment,
    );
  }

  // Step 2: Register lexical and class bindings.
  for (const { node } of scope.lexicalDeclarations) {
    buildVariableDeclarationBindings(scope, node, functionBuilder, environment);
  }
  for (const { node } of scope.classDeclarations) {
    buildClassDeclarationBindings(scope, node, functionBuilder, environment);
  }

  // Step 3: InstantiateFunctionObject for block-scoped functions.
  for (const { node } of scope.functionsToInitialize) {
    initializeFunctionDeclaration(
      scope,
      functionBuilder.scopeMap,
      node,
      functionBuilder,
      environment,
      moduleBuilder,
    );
  }
}

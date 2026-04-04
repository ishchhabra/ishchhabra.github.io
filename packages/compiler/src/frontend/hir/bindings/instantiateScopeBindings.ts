import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildClassDeclarationBindings } from "./buildClassDeclarationBindings";
import {
  initializeFunctionDeclaration,
  registerFunctionDeclarationBinding,
} from "./buildFunctionDeclarationBindings";
import { buildVariableDeclarationBindings } from "./buildVariableDeclarationBindings";

/**
 * Instantiates all bindings owned by the current Babel scope before the
 * scope body is lowered. This mirrors JavaScript's environment creation
 * more closely than the old "discover declarations while traversing"
 * approach:
 * - function/program scope owns `var` and hoisted function declarations
 * - lexical scopes (block/switch/loop) own `let`/`const`/`class` and
 *   block-scoped function declarations
 *
 * Per ECMA-262 §10.2.11, instantiation proceeds in two phases:
 *   Phase 1 — Create all bindings (var, let, const, class, function).
 *   Phase 2 — InstantiateFunctionObject for each function declaration.
 * This ordering ensures function bodies can reference any binding in the
 * scope, even those declared after the function in source order.
 */
export function instantiateScopeBindings(
  bindingsPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  const pendingFunctionDeclarations: NodePath<t.FunctionDeclaration>[] = [];

  // Phase 1: Create all bindings.
  bindingsPath.traverse({
    ClassDeclaration: (path: NodePath<t.ClassDeclaration>) => {
      buildClassDeclarationBindings(
        bindingsPath,
        path,
        functionBuilder,
        environment,
      );
    },
    FunctionDeclaration: (path: NodePath<t.FunctionDeclaration>) => {
      registerFunctionDeclarationBinding(
        bindingsPath,
        path,
        functionBuilder,
        environment,
      );
      pendingFunctionDeclarations.push(path);
    },
    VariableDeclaration: (path: NodePath<t.VariableDeclaration>) => {
      buildVariableDeclarationBindings(
        bindingsPath,
        path,
        functionBuilder,
        environment,
      );
    },
  });

  // Phase 2: InstantiateFunctionObject for each function declaration.
  // All bindings are now registered, so function bodies can resolve
  // references to any declaration in the scope.
  for (const path of pendingFunctionDeclarations) {
    initializeFunctionDeclaration(bindingsPath, path, functionBuilder, environment, moduleBuilder);
  }
}

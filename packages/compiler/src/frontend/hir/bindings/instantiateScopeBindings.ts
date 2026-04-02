import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { ModuleIRBuilder } from "../ModuleIRBuilder";
import { buildClassDeclarationBindings } from "./buildClassDeclarationBindings";
import { buildFunctionDeclarationBindings } from "./buildFunctionDeclarationBindings";
import { buildVariableDeclarationBindings } from "./buildVariableDeclarationBindings";

/**
 * Pending renames collected during scope instantiation, applied at the end
 * to avoid interleaving rename traversals with declaration discovery.
 */
export type PendingRenames = Array<[oldName: string, newName: string]>;

/**
 * Instantiates all bindings owned by the current Babel scope before the
 * scope body is lowered. This mirrors JavaScript's environment creation
 * more closely than the old "discover declarations while traversing"
 * approach:
 * - function/program scope owns `var` and hoisted function declarations
 * - lexical scopes (block/switch/loop) own `let`/`const`/`class` and
 *   block-scoped function declarations
 *
 * For `var`/`let`/`const`/`class`, this phase only creates the binding
 * identity; the actual value initialization happens when the declaration
 * statement is lowered. Function declarations are fully initialized here
 * per the ECMA spec (their body is built and emitted during instantiation).
 */
export function instantiateScopeBindings(
  bindingsPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
  moduleBuilder: ModuleIRBuilder,
) {
  const pendingRenames: PendingRenames = [];

  bindingsPath.traverse({
    ClassDeclaration: (path: NodePath<t.ClassDeclaration>) => {
      buildClassDeclarationBindings(
        bindingsPath,
        path,
        functionBuilder,
        environment,
        pendingRenames,
      );
    },
    FunctionDeclaration: (path: NodePath<t.FunctionDeclaration>) => {
      buildFunctionDeclarationBindings(
        bindingsPath,
        path,
        functionBuilder,
        environment,
        moduleBuilder,
        pendingRenames,
      );
    },
    VariableDeclaration: (path: NodePath<t.VariableDeclaration>) => {
      buildVariableDeclarationBindings(
        bindingsPath,
        path,
        functionBuilder,
        environment,
        pendingRenames,
      );
    },
  });

  if (pendingRenames.length > 0) {
    applyBatchRenames(bindingsPath, pendingRenames);
  }
}

/**
 * Applies all pending renames. Uses a fast path that directly mutates
 * Babel's tracked binding references for scopes with many renames,
 * falling back to scope.rename() for small scopes where correctness
 * of edge cases (JSX, exports, default params) outweighs the cost.
 *
 * The fast path is O(total_references) instead of O(renames × AST).
 * The threshold is set so that normal application code uses scope.rename()
 * (guaranteed correct), while large bundled files use the fast path to
 * avoid repeated whole-AST traversals.
 */
function applyBatchRenames(bindingsPath: NodePath, renames: PendingRenames) {
  if (renames.length < 50) {
    for (const [oldName, newName] of renames) {
      bindingsPath.scope.rename(oldName, newName);
    }
    return;
  }

  const scope = bindingsPath.scope;

  for (const [oldName] of renames) {
    const binding = scope.getBinding(oldName);
    if (!binding) continue;

    const parentDeclar = binding.path.find(
      (p: NodePath) => p.isDeclaration() || p.isFunctionExpression() || p.isClassExpression(),
    );
    if (parentDeclar) {
      const maybeExport = parentDeclar.parentPath;
      if (
        maybeExport?.isExportDeclaration() &&
        !maybeExport.isExportDefaultDeclaration() &&
        !maybeExport.isExportAllDeclaration()
      ) {
        (
          maybeExport as typeof maybeExport & {
            splitExportDeclaration(): void;
          }
        ).splitExportDeclaration();
      }
    }
  }

  for (const [oldName, newName] of renames) {
    const binding = scope.getBinding(oldName);
    if (!binding) {
      scope.rename(oldName, newName);
      continue;
    }

    binding.identifier.name = newName;

    for (const refPath of binding.referencePaths) {
      if (refPath.isIdentifier()) {
        refPath.node.name = newName;
      }
    }

    for (const violation of binding.constantViolations) {
      if (violation.isAssignmentExpression()) {
        const left = violation.get("left");
        if (left.isIdentifier() && left.node.name === oldName) {
          left.node.name = newName;
        }
      } else if (violation.isUpdateExpression()) {
        const arg = violation.get("argument");
        if (arg.isIdentifier() && arg.node.name === oldName) {
          arg.node.name = newName;
        }
      }
    }

    if (binding.path.isDeclaration() || binding.path.isVariableDeclarator()) {
      const ids = binding.path.getOuterBindingIdentifiers();
      for (const name in ids) {
        if (name === oldName) ids[name].name = newName;
      }
    }

    scope.removeOwnBinding(oldName);
    scope.bindings[newName] = binding;
  }
}

import { NodePath } from "@babel/core";
import * as t from "@babel/types";
import { Environment } from "../../../environment";
import { FunctionIRBuilder } from "../FunctionIRBuilder";
import { buildClassDeclarationBindings } from "./buildClassDeclarationBindings";
import { buildFunctionDeclarationBindings } from "./buildFunctionDeclarationBindings";
import { buildVariableDeclarationBindings } from "./buildVariableDeclarationBindings";

/**
 * Pending renames collected during binding discovery, applied at the end
 * of buildBindings to avoid interleaving rename traversals with binding
 * discovery.
 */
export type PendingRenames = Array<[oldName: string, newName: string]>;

export function buildBindings(
  bindingsPath: NodePath,
  functionBuilder: FunctionIRBuilder,
  environment: Environment,
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
 * (guaranteed correct), while large bundled files (posthog-js, etc.)
 * use the fast path to avoid 30+ second compile times.
 */
function applyBatchRenames(bindingsPath: NodePath, renames: PendingRenames) {
  // For small rename sets, use Babel's scope.rename() directly — it
  // handles all edge cases correctly (JSX tags, export declarations,
  // shorthand object properties, etc.). The performance issue only
  // manifests with hundreds of renames in a single scope.
  if (renames.length < 50) {
    for (const [oldName, newName] of renames) {
      bindingsPath.scope.rename(oldName, newName);
    }
    return;
  }

  const scope = bindingsPath.scope;

  // Phase 1: Split export declarations BEFORE any renaming.
  // scope.rename() does this internally; we replicate it here because
  // splitExportDeclaration changes the AST structure and must happen
  // while names are still original.
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
        maybeExport.splitExportDeclaration();
      }
    }
  }

  // Phase 2: Apply all renames via binding reference paths.
  // Instead of scope.rename()'s full AST traversal per rename, we
  // directly mutate the binding's tracked references — O(refs) per
  // binding instead of O(AST_nodes).
  for (const [oldName, newName] of renames) {
    const binding = scope.getBinding(oldName);
    if (!binding) {
      // No binding found — fall back to scope.rename for safety.
      scope.rename(oldName, newName);
      continue;
    }

    // Rename the binding's declaration identifier node.
    binding.identifier.name = newName;

    // Rename all reference paths tracked by Babel.
    for (const refPath of binding.referencePaths) {
      if (refPath.isIdentifier()) {
        refPath.node.name = newName;
      }
    }

    // Rename constant violation (assignment/update) identifiers.
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

    // Rename the binding declaration's own identifier nodes.
    if (binding.path.isDeclaration() || binding.path.isVariableDeclarator()) {
      const ids = binding.path.getOuterBindingIdentifiers();
      for (const name in ids) {
        if (name === oldName) ids[name].name = newName;
      }
    }

    // Update the scope's binding map.
    scope.removeOwnBinding(oldName);
    scope.bindings[newName] = binding;
  }
}

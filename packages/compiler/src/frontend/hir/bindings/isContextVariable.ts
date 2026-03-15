import { NodePath } from "@babel/traverse";
import { Binding } from "@babel/traverse";

/**
 * Determines whether a Babel binding is a "context variable" — a mutable
 * variable that is captured and/or mutated across closure (nested function)
 * boundaries. Context variables are excluded from SSA renaming.
 *
 * A variable is a context variable if:
 *   - It is reassigned inside a nested function, OR
 *   - It is reassigned anywhere AND referenced by a nested function
 */
export function isContextVariable(binding: Binding, scopePath: NodePath): boolean {
  // Determine the function that owns this binding. For program-level
  // bindings, ownerFn is null.
  const ownerFn = scopePath.getFunctionParent();

  let reassigned = false;
  let referencedByInnerFn = false;
  let reassignedByInnerFn = false;

  for (const violation of binding.constantViolations) {
    reassigned = true;
    if (isInNestedFunction(violation, ownerFn)) {
      reassignedByInnerFn = true;
    }
  }

  if (!reassigned) return false;

  if (reassignedByInnerFn) return true;

  for (const ref of binding.referencePaths) {
    if (isInNestedFunction(ref, ownerFn)) {
      referencedByInnerFn = true;
      break;
    }
  }

  return reassigned && referencedByInnerFn;
}

/**
 * Returns true if `innerPath` is inside a different (nested) function
 * compared to `ownerFn`. If `ownerFn` is null (program-level), any
 * reference inside a function counts as nested.
 */
function isInNestedFunction(innerPath: NodePath, ownerFn: NodePath | null): boolean {
  const innerFn = innerPath.getFunctionParent();
  return innerFn !== ownerFn;
}

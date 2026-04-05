import { type Binding, type Reference, type Scope } from "../../scope/Scope";

/**
 * Determines whether a binding is a "context variable" -- a mutable
 * variable that is captured and/or mutated across closure (nested function)
 * boundaries. Context variables are excluded from SSA renaming.
 *
 * A variable is a context variable if:
 *   - It is reassigned inside a nested function, OR
 *   - It is reassigned anywhere AND referenced by a nested function
 */
export function isContextVariable(
  binding: Binding,
  scope: Scope,
): boolean {
  // Determine the function/program scope that owns this binding.
  const ownerFnScope =
    scope.kind === "function" || scope.kind === "program"
      ? scope
      : scope.getFunctionParent();

  let reassigned = false;
  let referencedByInnerFn = false;
  let reassignedByInnerFn = false;

  for (const mutation of binding.mutations) {
    reassigned = true;
    if (isInNestedFunction(mutation, ownerFnScope)) {
      reassignedByInnerFn = true;
    }
  }

  if (!reassigned) return false;

  if (reassignedByInnerFn) return true;

  for (const ref of binding.references) {
    if (isInNestedFunction(ref, ownerFnScope)) {
      referencedByInnerFn = true;
      break;
    }
  }

  return reassigned && referencedByInnerFn;
}

/**
 * Returns true if the reference is inside a different (nested) function
 * compared to `ownerFnScope`.
 */
function isInNestedFunction(
  ref: Reference,
  ownerFnScope: Scope | null,
): boolean {
  const refFnScope =
    ref.scope.kind === "function" || ref.scope.kind === "program"
      ? ref.scope
      : ref.scope.getFunctionParent();
  return refFnScope !== ownerFnScope;
}

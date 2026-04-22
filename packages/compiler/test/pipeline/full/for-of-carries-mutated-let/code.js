// Regression: SSABuilder.renameRegionBranchOp must read `resultPlaces`
// directly, not `getDefs()`. For-of/for-in's `getDefs()` includes
// `iterationValue` + destructure target defs (region-entry bindings),
// which must NOT be appended to the op's result places. Mixing them
// inflated the list, misaligned yield-to-result arg indices, and made
// the carried let disappear from the op's output — leading to
// `ReferenceError` at runtime and incorrect return values.
//
// Additionally exercises ForOf.getOperands() including `inits` so DCE
// keeps the seed alive for SSAEliminator's copy-store lowering.

export function lastMatch(items) {
  let current = "";
  for (const item of items) {
    if (item.id) current = item.id;
  }
  return current;
}

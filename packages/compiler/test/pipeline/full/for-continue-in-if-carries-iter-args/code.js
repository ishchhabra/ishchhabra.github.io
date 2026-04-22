// Regression: `continue` inside an `if` nested in a `for` loop
// must forward all loop-carried values (acc, i) to the step block,
// not just the ones explicitly assigned on the continue path.
//
// Pre-fix: SSABuilder pushed every RegionBranchOp onto `loopContexts`
// (including the enclosing IfOp). `continue` resolved to the IfOp's
// carriedDecls (= [acc] only, since IfOp didn't see `i` as written),
// missing the `i` copy. Result: runtime infinite loop at the first
// `continue` — `i` never advanced.
//
// Post-fix: only ops implementing `LoopLikeOpInterface` (or the
// labeled-block escape hatch) push onto loopContexts. IfOp doesn't,
// so `continue` correctly resolves to the ForOp, whose carriedDecls
// includes both `acc` and `i`.
export function resolve(parts) {
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] === "x") {
      acc = acc + "/X";
      continue;
    }
    acc = acc + "/Y";
  }
  return acc;
}

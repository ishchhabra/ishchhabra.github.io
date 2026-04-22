// Regression: a `let` declared with no initializer, assigned inside
// a `try` block, and read after the try — must NOT have its initial
// `undefined` propagated as a compile-time constant.
//
// Pre-fix: ConstantPropagationPass forwarded the declaration-kind
// StoreLocal's `value` lattice onto the binding's `lval` lattice,
// treating the cell as if it held the declared value forever. Since
// the TryOp wipes the walker state (the catch body's `call` has
// Unknown memory effects), the post-try LoadLocal found no reaching
// store, fell back to the `lval`'s lattice — which was still the
// initial declaration's value. Result: `byKey[key]` compiled to
// `undefined[key]` → `TypeError: Cannot read properties of undefined`.
//
// Post-fix: the fallback returns BOTTOM. The LoadLocal stays as a
// runtime read.
export function restore(key) {
  let byKey;
  try {
    byKey = JSON.parse(sessionStorage.getItem("k") || "{}");
  } catch (error) {
    console.error(error);
    return;
  }
  return byKey[key];
}

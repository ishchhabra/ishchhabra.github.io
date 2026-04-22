// Regression: calling a method where the callee is a MemberExpression,
// and an argument is a ternary (or any expression that lowers to
// IfOp regions), must preserve the MemberExpression as the call's
// callee — NOT spill it into a named temp.
//
// Pre-fix: VMP lacked the method-callee preservation rule. The
// property-read (LoadStaticProperty) was side-effectful + had an
// intervening "reorder hazard" (the IfOp), triggering the
// order-sensitive spill. It emitted `const t = obj.m; t(args)`,
// detaching the `this` binding. At runtime: `String.prototype.substring
// called on null or undefined` because `t` was called with `this =
// undefined`.
//
// Post-fix: VMP's method-callee exemption keeps `obj.m` inlined as
// the call's callee so codegen emits `obj.m(args)` and JS binds
// `this` correctly.
export function substringWithTernary(s, a, b) {
  return s.substring(0, a > 0 ? b : a);
}

export function methodCallWithConditional(obj, x) {
  return obj.method(x > 0 ? "a" : "b");
}

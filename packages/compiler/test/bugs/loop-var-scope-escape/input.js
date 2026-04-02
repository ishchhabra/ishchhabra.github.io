// Bug 5: Loop variable SSA versions escape block scope
//
// NOTE: This bug does not reproduce with the standalone `compile()` API.
// It requires the full project compilation pipeline (compileProjectDetailed)
// with multiple optimization passes interacting in a fixpoint loop.
// The pattern below is extracted from @tanstack/store alien.js.
//
// In the full project context, SSA version `$X_2` of a loop variable is
// declared inside a conditional block but referenced by a phi assignment
// outside that block. The standalone compiler correctly generates phis
// for this pattern, but the optimizer's fixpoint loop (copy propagation +
// copy coalescing + copy folding) can later introduce the scope escape.

function notifyNode(link) {
  let current = link;
  let batched;
  top: while (true) {
    const sub = current.sub;
    const flags = sub.flags;
    if (flags & 2) {
      current = current.nextSub;
      continue;
    }
    batched = current;
    while (batched !== undefined) {
      const value = batched.value;
      const prev = batched.prev;
      if (value.flags & 4) {
        batched = prev;
        continue;
      }
      current = value.nextSub;
      batched = prev;
      continue top;
    }
    current = current.nextSub;
  }
}

export { notifyNode };

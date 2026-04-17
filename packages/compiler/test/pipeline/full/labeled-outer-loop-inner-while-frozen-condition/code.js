// Bug: in a labeled outer loop with an inner while that updates a
// variable used as the loop condition, the compiler creates a frozen
// snapshot for the while condition instead of using the live variable.
// Result: the inner while never exits when the updated value is undefined.
function foo(link) {
  let next = link.nextSub;
  let stack;
  top: do {
    if (link.flags & 1) {
      const subSubs = link.sub;
      if (subSubs !== undefined) {
        const nextSub = (link = subSubs).nextSub;
        if (nextSub !== undefined) {
          stack = { value: next, prev: stack };
          next = nextSub;
        }
        continue;
      }
    }
    if ((link = next) !== undefined) {
      next = link.nextSub;
      continue;
    }
    while (stack !== undefined) {
      link = stack.value;
      stack = stack.prev;
      if (link !== undefined) {
        next = link.nextSub;
        continue top;
      }
    }
    break;
  } while (true);
}

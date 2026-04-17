// Bug: inside a do-while loop, when a variable is used in a bitmask
// condition (x & (A | B)) and also assigned 0 in the else branch,
// the compiler incorrectly constant-folds the condition to 0 / !0.
function foo(x) {
  do {
    let flags = x.flags;
    if (!(flags & (4 | 32))) {
      x.flags = flags | 32;
    } else {
      flags = 0;
    }
    return flags;
  } while (true);
}

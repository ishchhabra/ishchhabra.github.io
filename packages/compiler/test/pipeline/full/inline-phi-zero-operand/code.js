function pick(cond, a, b) {
  var x = undefined,
    y = undefined;
  return cond ? (a ? (x = a) : (y = b), { x: x, y: y }) : {};
}

console.log(pick(globalThis.c, globalThis.a, globalThis.b));

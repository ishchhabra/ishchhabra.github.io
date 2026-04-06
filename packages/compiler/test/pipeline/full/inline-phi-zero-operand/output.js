const a = function a(a, b, c) {
  let U = undefined;
  let W = undefined;
  let Y = undefined;
  if (a) {
    let Z = undefined;
    if (b) {
      U = b;
      W = undefined;
      Z = b;
    } else {
      U = undefined;
      W = c;
      Z = c;
    }
    Y =
      (Z,
      {
        x: U,
        y: W,
      });
  } else {
    Y = {};
  }
  return Y;
};
console.log(a(globalThis.c, globalThis.a, globalThis.b));

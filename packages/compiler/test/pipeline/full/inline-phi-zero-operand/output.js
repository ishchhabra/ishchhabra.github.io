const a = function a(a, b, c) {
  let Q = undefined;
  let S = undefined;
  let U = undefined;
  if (a) {
    let V = undefined;
    if (b) {
      Q = b;
      S = undefined;
      V = b;
    } else {
      Q = undefined;
      S = c;
      V = c;
    }
    U =
      (V,
      {
        x: Q,
        y: S,
      });
  } else {
    U = {};
  }
  return U;
};
console.log(a(globalThis.c, globalThis.a, globalThis.b));

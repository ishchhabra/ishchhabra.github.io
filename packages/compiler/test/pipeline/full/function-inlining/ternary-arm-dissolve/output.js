const a = function a({ x: a, ...b }) {
  return b;
};
export const f = function f(a) {
  let v = a;
  for (const j of [1, 2]) {
    let w = undefined;
    if (j) {
      const { x: A, ...C } = v;
      w = C;
    } else {
      w = a;
    }
    v = w;
  }
  return v;
};

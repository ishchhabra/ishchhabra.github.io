const a = function a({ x: a, ...b }) {
  return b;
};
export const f = function f(a) {
  let k = a;
  for (const b of [1, 2]) {
    let l = undefined;
    if (b) {
      const { x: p, ...r } = k;
      l = r;
    } else {
      l = a;
    }
    k = l;
  }
  return k;
};

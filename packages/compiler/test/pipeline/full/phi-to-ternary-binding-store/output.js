export const f = function f(a) {
  let k = undefined;
  let l = a;
  for (const b of [1, 2]) {
    if (b) {
      const { x: d, ...f } = l;
      k = f;
    } else {
      k = a;
    }
    l = k;
  }
  return l;
};

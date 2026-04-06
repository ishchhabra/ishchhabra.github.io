export const f = function f(a) {
  let C = undefined;
  let D = a;
  for (const j of [1, 2]) {
    if (j) {
      const { x: p, ...r } = D;
      C = r;
    } else {
      C = a;
    }
    D = C;
  }
  return D;
};

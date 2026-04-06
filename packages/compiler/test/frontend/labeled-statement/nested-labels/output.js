let c = 0;
let V = 0;
outer: while (V < 5) {
  let j = 0;
  let W = 0;
  let X = undefined;
  let Y = undefined;
  inner: while (W < 5) {
    if (W === 2) {
      const D = W;
      D;
      W = W + 1;
      continue;
    }
    if (W === 3) {
      const M = V;
      M;
      V = V + 1;
      X = W;
      continue outer;
    }
    if (V === 4) {
      Y = undefined;
      break outer;
    }
    console.log(V, W);
    const D = W;
    D;
    W = W + 1;
  }
  const M = V;
  M;
  V = V + 1;
  X = W;
}

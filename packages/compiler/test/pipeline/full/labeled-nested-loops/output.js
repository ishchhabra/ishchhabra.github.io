let V = 0;
outer: while (V < 5) {
  let W = 0;
  inner: while (W < 5) {
    if (W === 2) {
      W = W + 1;
      continue;
    }
    if (W === 3) {
      V = V + 1;
      continue outer;
    }
    if (V === 4) {
      break outer;
    }
    console.log(V, W);
    W = W + 1;
  }
  V = V + 1;
}

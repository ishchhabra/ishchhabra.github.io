let c = 0;
let P = 0;
outer: while (P < 3) {
  let j = 0;
  let Q = 0;
  let R = undefined;
  while (Q < 3) {
    if (Q === 1) {
      const G = P;
      G;
      P = P + 1;
      R = Q;
      continue outer;
    }
    console.log(P, Q);
    const x = Q;
    x;
    Q = Q + 1;
  }
  const G = P;
  G;
  P = P + 1;
  R = Q;
}

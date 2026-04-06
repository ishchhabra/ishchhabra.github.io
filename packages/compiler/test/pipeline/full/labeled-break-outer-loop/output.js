let P = 0;
outer: while (P < 3) {
  let Q = 0;
  while (Q < 3) {
    if (Q === 1) {
      break outer;
    }
    console.log(P, Q);
    Q = Q + 1;
  }
  P = P + 1;
}

let c = 0;
let g = 0;
let C = undefined;
let D = 0;
let E = 0;
while (E < 10) {
  if (E === 5) {
    C = undefined;
    const t = E;
    t;
    D = C;
    E = E + 1;
    continue;
  }
  C = D + E;
  const t = E;
  t;
  D = C;
  E = E + 1;
}

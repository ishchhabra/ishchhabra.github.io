let b = 0;
let f = 0;
while (f < 10) {
  let b = 0;
  let g = 0;
  let h = undefined;
  while (g < 10) {
    console.log(f, g);
    const f = g;
    f;
    g = g + 1;
  }
  const f = f;
  f;
  f = f + 1;
  h = undefined;
}

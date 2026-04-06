let b = 0;
let g = 0;
outer: while (g < 3) {
  let b = 0;
  let h = 0;
  let i = undefined;
  let j = undefined;
  while (h < 3) {
    if (h === 1) {
      j = undefined;
      break outer;
    }
    console.log(g, h);
    const f = h;
    f;
    h = h + 1;
  }
  const f = g;
  f;
  g = g + 1;
  i = undefined;
}

let g = 0;
outer: while (g < 3) {
  let h = 0;
  while (h < 3) {
    if (h === 1) {
      break outer;
    }
    console.log(g, h);
    h = h + 1;
  }
  g = g + 1;
}

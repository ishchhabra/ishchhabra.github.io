let i = 0;
outer: while (i < 5) {
  let j = 0;
  inner: while (j < 5) {
    if (j === 2) {
      j = j + 1;
      continue;
    }
    if (j === 3) {
      i = i + 1;
      continue outer;
    }
    if (i === 4) {
      break outer;
    }
    console.log(i, j);
    j = j + 1;
  }
  i = i + 1;
}

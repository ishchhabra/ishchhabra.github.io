let b = 0;
let i = 0;
outer: while (i < 5) {
  let b = 0;
  let j = 0;
  let k = undefined;
  let l = undefined;
  inner: while (j < 5) {
    if (j === 2) {
      const f = j;
      f;
      j = j + 1;
      continue;
    }
    if (j === 3) {
      const f = i;
      f;
      i = i + 1;
      k = j;
      continue outer;
    }
    if (i === 4) {
      l = undefined;
      break outer;
    }
    console.log(i, j);
    const f = j;
    f;
    j = j + 1;
  }
  const f = i;
  f;
  i = i + 1;
  k = j;
}

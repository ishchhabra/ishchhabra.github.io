outer: for (let i = 0; i < 5; i++) {
  inner: for (let j = 0; j < 5; j++) {
    if (j === 2) continue inner;
    if (j === 3) continue outer;
    if (i === 4) break outer;
    console.log(i, j);
  }
}

let b = 0;
let e = 0;
while (e < 10) {
  if (e === 5) {
    const f = e;
    f;
    e = e + 1;
    continue;
  }
  console.log(e);
  const f = e;
  f;
  e = e + 1;
}

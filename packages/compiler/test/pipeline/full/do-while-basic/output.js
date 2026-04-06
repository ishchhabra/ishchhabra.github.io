let o = 0;
let p = undefined;
while (true) {
  const d = o + 1;
  if (!(d < 10)) {
    p = d;
    break;
  }
  o = d;
}
console.log(p);

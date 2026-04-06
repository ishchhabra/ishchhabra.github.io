let x = 0;
let y = undefined;
while (true) {
  const i = x + 1;
  if (!(i < 10)) {
    y = i;
    break;
  }
  x = i;
}
console.log(y);

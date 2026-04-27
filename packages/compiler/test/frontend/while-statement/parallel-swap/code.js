let x = 1;
let y = 2;
let n = 0;
while (n < 1) {
  [x, y] = [y, x];
  n++;
}
console.log(x, y);

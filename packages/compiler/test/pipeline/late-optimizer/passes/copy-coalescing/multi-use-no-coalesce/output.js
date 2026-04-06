let c = 0;
let n = 0;
if (globalThis.cond) {
  c = globalThis.compute();
  console.log(c);
  n = c;
}
console.log(n);

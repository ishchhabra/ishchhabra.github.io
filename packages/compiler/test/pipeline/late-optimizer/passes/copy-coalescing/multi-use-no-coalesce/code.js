let x = 0;
if (globalThis.cond) {
  x = globalThis.compute();
  console.log(x);
}
console.log(x);

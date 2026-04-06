let f = undefined;
let s = undefined;
s = f;
for (const f of items) {
  g = f;
  console.log(g);
  s = g;
}
console.log(f);

let f = undefined;
let o = undefined;
o = f;
for (const f of items) {
  g = f;
  console.log(g);
  o = g;
}
console.log(f);

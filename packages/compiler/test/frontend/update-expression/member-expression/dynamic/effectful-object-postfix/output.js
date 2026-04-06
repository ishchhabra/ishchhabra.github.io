const a = function a() {
  return g;
};
const b = function b() {
  return 0;
};
let g = [10];
const k = a();
const o = b();
const r = k[o];
const v = r + 1;
k[o] = v;
const z = r;

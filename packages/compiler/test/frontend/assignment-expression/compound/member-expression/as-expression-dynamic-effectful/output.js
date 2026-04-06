const a = function a() {
  return "b";
};
const b = function b() {
  return 3;
};
let i = {
  b: 1,
};
const n = a();
const t = i[n] + b();
i[n] = t;
const x = t;

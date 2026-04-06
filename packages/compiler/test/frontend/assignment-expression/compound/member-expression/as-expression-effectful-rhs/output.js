const a = function a() {
  return 3;
};
let i = {
  b: 1,
};
const p = i.b + a();
i.b = p;
const t = p;

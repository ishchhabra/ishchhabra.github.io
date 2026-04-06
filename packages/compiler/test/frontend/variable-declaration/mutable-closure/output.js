const a = function a() {
  const a = function a() {
    g = g + 1;
  };
  const b = function b() {
    return g;
  };
  let g = 0;
  a();
  return b();
};

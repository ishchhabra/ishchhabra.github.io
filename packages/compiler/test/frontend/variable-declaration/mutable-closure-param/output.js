const a = function a(a) {
  const b = function b() {
    a = a + 1;
  };
  const c = function c() {
    return a;
  };
  b();
  return c();
};

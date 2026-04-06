const a = function a(a) {
  if (a === 0) {
    return true;
  }
  return b(a - 1);
};
const b = function b(a) {
  if (a === 0) {
    return false;
  }
  return a(a - 1);
};
const i = a(4);

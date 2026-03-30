function f() {
  const [a = b, b = 1] = [];
  return a + b;
}

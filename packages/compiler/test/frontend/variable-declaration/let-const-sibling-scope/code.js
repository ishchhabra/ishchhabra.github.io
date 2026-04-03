function f(a) {
  if (a) {
    const x = a.foo;
    return x;
  }
  const x = a.bar;
  return x;
}
export { f };

function f(x) {
  switch (x) {
    case 0:
      return g;
      function g() {
        return 1;
      }
    default:
      return 2;
  }
}

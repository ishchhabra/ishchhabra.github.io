function foo({a, b}, {c, d}) {
  return a + b + c + d;
}
console.log(foo({a: 2, b: 3}, {c: 1, d: 5}));

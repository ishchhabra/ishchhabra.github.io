let $0 = {};
({ a: $0.a, b: $0.b } = {
  a: 1,
  b: 2,
});
console.log($0.a, $0.b);

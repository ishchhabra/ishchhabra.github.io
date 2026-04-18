function $0({ a: $1, b: $2 }, { c: $3, d: $4 }) {
  return $1 + $2 + $3 + $4;
}
console.log(
  $0(
    {
      a: 2,
      b: 3,
    },
    {
      c: 1,
      d: 5,
    },
  ),
);

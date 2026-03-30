function test(x, y) {
  const cond = x > y;
  if (cond) {
    return x;
  }
  return y;
}

console.log(test(1, 2));

function choose(flag, a, b) {
  let value;
  if (flag) {
    value = a;
  } else {
    value = b;
  }
  const result = value;
  return result;
}

console.log(choose(true, 1, 2));

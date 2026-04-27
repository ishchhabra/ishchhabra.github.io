function f(a, b) {
  let value;
  if (a) {
    value = b ?? "default";
  } else {
    value = "fallback";
  }
  return value;
}

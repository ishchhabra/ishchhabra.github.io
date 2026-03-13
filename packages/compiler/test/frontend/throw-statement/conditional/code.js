function validate(x) {
  if (x < 0) {
    throw new Error("negative");
  }
  return x + 1;
}

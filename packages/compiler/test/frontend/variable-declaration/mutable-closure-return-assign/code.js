function foo() {
  let x = 0;
  function capture() {
    return x;
  }
  return (x = 1);
}

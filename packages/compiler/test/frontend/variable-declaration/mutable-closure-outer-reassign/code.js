function outer() {
  let x = 0;

  function read() {
    return x;
  }

  x = 1;
  return read();
}

function outer() {
  let x = 0;

  function inc() {
    x = x + 1;
  }

  function read() {
    return x;
  }

  inc();
  return read();
}

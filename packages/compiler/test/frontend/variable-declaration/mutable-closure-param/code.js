function outer(x) {
  function inc() {
    x = x + 1;
  }

  function read() {
    return x;
  }

  inc();
  return read();
}

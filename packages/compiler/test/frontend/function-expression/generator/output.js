const c = function* () {
  let c = 0;
  let f = undefined;
  f = c;
  while (true) {
    const a = f;
    d = f + 1;
    yield a;
    f = d;
  }
};

const c = function* () {
  let c = 0;
  let p = undefined;
  p = c;
  while (true) {
    const f = p;
    i = p + 1;
    yield f;
    p = i;
  }
};

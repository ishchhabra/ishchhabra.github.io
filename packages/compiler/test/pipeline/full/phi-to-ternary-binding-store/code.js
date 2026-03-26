function f(obj) {
  let result = obj;
  for (const k of [1, 2]) {
    if (k) {
      const { x, ...rest } = result;
      result = rest;
    } else {
      result = obj;
    }
  }
  return result;
}

export { f };

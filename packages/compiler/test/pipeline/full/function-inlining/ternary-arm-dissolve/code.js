function extract({ x, ...rest }) {
  return rest;
}

function f(obj) {
  let result = obj;
  for (const k of [1, 2]) {
    if (k) {
      result = extract(result);
    } else {
      result = obj;
    }
  }
  return result;
}

export { f };

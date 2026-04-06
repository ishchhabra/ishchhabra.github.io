const a = function a(a) {
  const b = function b(a) {
    const n = (a && a.position && a.position[a]) || {};
    if (typeof n.line === "number" && n.line > 0 && typeof n.column === "number" && n.column > 0) {
      let o = undefined;
      let R = undefined;
      if (typeof n.offset === "number" && n.offset > -1) {
        s = n.offset;
        R = s;
      } else {
        v = undefined;
        R = v;
      }
      return {
        line: n.line,
        column: n.column,
        offset: R,
      };
    }
  };
  return b;
};

const a = function a(a) {
  const b = function b(a) {
    const c = (a && a.position && a.position[a]) || {};
    if (typeof c.line === "number" && c.line > 0 && typeof c.column === "number" && c.column > 0) {
      let $46_0 = undefined;
      let $55_phi_76 = undefined;
      if (typeof c.offset === "number" && c.offset > -1) {
        $46_1 = c.offset;
        $55_phi_76 = $46_1;
      } else {
        $46_2 = undefined;
        $55_phi_76 = $46_2;
      }
      return {
        line: c.line,
        column: c.column,
        offset: $55_phi_76,
      };
    }
  };
  return b;
};

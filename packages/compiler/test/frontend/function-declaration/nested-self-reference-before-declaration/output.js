const $0_0 = function $0_0($1_0) {
  const $2_0 = function $2_0($3_0) {
    const point = ($3_0 && $3_0.position && $3_0.position[$1_0]) || {};
    if (
      typeof point.line === "number" &&
      point.line > 0 &&
      typeof point.column === "number" &&
      point.column > 0
    ) {
      let $46_0 = undefined;
      let $55_phi_76 = undefined;
      if (typeof point.offset === "number" && point.offset > -1) {
        $46_1 = point.offset;
        $55_phi_76 = $46_1;
      } else {
        $46_2 = undefined;
        $55_phi_76 = $46_2;
      }
      return {
        line: point.line,
        column: point.column,
        offset: $55_phi_76,
      };
    }
  };
  return $2_0;
};

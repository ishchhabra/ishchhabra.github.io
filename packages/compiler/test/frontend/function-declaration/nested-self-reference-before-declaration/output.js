function $0_0($1_0) {
  function $2_0($3_0) {
    const point = ($3_0 && $3_0.position && $3_0.position[$1_0]) || {};
    if (
      typeof point.line === "number" &&
      point.line > 0 &&
      typeof point.column === "number" &&
      point.column > 0
    ) {
      let $46_0 = undefined;
      let $53_phi_72 = undefined;
      if (typeof point.offset === "number" && point.offset > -1) {
        $46_0 = point.offset;
        $53_phi_72 = $46_0;
      } else {
        $46_0 = undefined;
        $53_phi_72 = $46_0;
      }
      return {
        line: point.line,
        column: point.column,
        offset: $53_phi_72,
      };
    }
  }
  return $2_0;
}

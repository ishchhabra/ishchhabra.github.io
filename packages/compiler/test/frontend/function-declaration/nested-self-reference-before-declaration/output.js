const $0_0 = function $0_0($1_0) {
  const $2_0 = function $2_0($3_0) {
    const $4_0 = ($3_0 && $3_0.position && $3_0.position[$1_0]) || {};
    if (
      typeof $4_0.line === "number" &&
      $4_0.line > 0 &&
      typeof $4_0.column === "number" &&
      $4_0.column > 0
    ) {
      let $46_0 = undefined;
      let $55_phi_76 = undefined;
      if (typeof $4_0.offset === "number" && $4_0.offset > -1) {
        $46_1 = $4_0.offset;
        $55_phi_76 = $46_1;
      } else {
        $46_2 = undefined;
        $55_phi_76 = $46_2;
      }
      return {
        line: $4_0.line,
        column: $4_0.column,
        offset: $55_phi_76,
      };
    }
  };
  return $2_0;
};

function $0_0($1_0) {
  function $2_0($3_0) {
    const $4_0 = ($3_0 && $3_0.position && $3_0.position[$1_0]) || {};
    if (
      typeof $4_0.line === "number" &&
      $4_0.line > 0 &&
      typeof $4_0.column === "number" &&
      $4_0.column > 0
    ) {
      return {
        line: $4_0.line,
        column: $4_0.column,
        offset: typeof $4_0.offset === "number" && $4_0.offset > -1 ? $4_0.offset : undefined,
      };
    }
  }
  return $2_0;
}

function $0($1) {
  function $2($3) {
    const $4 = ($3 && $3.position && $3.position[$1]) || {};
    if (
      typeof $4.line === "number" &&
      $4.line > 0 &&
      typeof $4.column === "number" &&
      $4.column > 0
    ) {
      let $62 = undefined;
      return {
        line: $4.line,
        column: $4.column,
        offset: typeof $4.offset === "number" && $4.offset > -1 ? $4.offset : undefined,
      };
    }
  }
  return $2;
}

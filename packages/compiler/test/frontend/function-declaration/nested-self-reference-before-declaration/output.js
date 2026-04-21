function $0($1) {
  function $2($3) {
    const $71 = ($3 && $3.position && $3.position[$1]) || {};
    if (
      typeof $71.line === "number" &&
      $71.line > 0 &&
      typeof $71.column === "number" &&
      $71.column > 0
    ) {
      let $62 = undefined;
      if (typeof $71.offset === "number" && $71.offset > -1) {
        const $73 = $71.offset;
        $62 = $73;
      } else {
        $62 = undefined;
      }
      return {
        line: $71.line,
        column: $71.column,
        offset: $62,
      };
    }
  }
  return $2;
}

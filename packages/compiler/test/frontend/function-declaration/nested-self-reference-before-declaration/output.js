function $0($1) {
  function $2($3) {
    const $99 = $3;
    let $6 = undefined;
    let $9 = undefined;
    let $15 = undefined;
    let $23 = undefined;
    let $28 = undefined;
    let $34 = undefined;
    let $53 = undefined;
    let $59 = undefined;
    if ($9) {
      $15 = $9;
    } else {
      const $105 = {};
      $15 = $105;
    }
    const $107 = typeof $15.line === "number";
    if ($34) {
      const $115 = typeof $15.offset === "number";
      if ($53) {
        const $119 = $15.offset;
        $59 = $119;
      } else {
        $59 = undefined;
      }
      return {
        line: $15.line,
        column: $15.column,
        offset: $59,
      };
    }
  }
  return $2;
}

function $0($1) {
  function $2($3) {
    const $83 = $3;
    let $7;
    let $10;
    let $23;
    let $28;
    let $34;
    let $53;
    let $59;
    if ($83) {
      $7 = $3.position;
    } else {
      $7 = $83;
    }
    if ($7) {
      $10 = $3.position[$1];
    } else {
      $10 = $7;
    }
    const $85 = $10 || {};
    const $86 = typeof $85.line === "number";
    if ($86) {
      $23 = $85.line > 0;
    } else {
      $23 = $86;
    }
    if ($23) {
      $28 = typeof $85.column === "number";
    } else {
      $28 = $23;
    }
    if ($28) {
      $34 = $85.column > 0;
    } else {
      $34 = $28;
    }
    if ($34) {
      const $87 = typeof $85.offset === "number";
      if ($87) {
        $53 = $85.offset > -1;
      } else {
        $53 = $87;
      }
      if ($53) {
        $59 = $85.offset;
      } else {
        $59 = undefined;
      }
      return {
        line: $85.line,
        column: $85.column,
        offset: $59,
      };
    }
  }
  return $2;
}

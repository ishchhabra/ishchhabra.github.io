function $0($1) {
  function $2($3) {
    const $82 = $3;
    let $7;
    let $10;
    let $23;
    let $28;
    let $34;
    let $53;
    let $59;
    if ($82) {
      $7 = $3.position;
    } else {
      $7 = $82;
    }
    if ($7) {
      $10 = $3.position[$1];
    } else {
      $10 = $7;
    }
    const $83 = $10 ? $10 : {};
    const $84 = typeof $83.line === "number";
    if ($84) {
      $23 = $83.line > 0;
    } else {
      $23 = $84;
    }
    if ($23) {
      $28 = typeof $83.column === "number";
    } else {
      $28 = $23;
    }
    if ($28) {
      $34 = $83.column > 0;
    } else {
      $34 = $28;
    }
    if ($34) {
      const $85 = typeof $83.offset === "number";
      if ($85) {
        $53 = $83.offset > -1;
      } else {
        $53 = $85;
      }
      if ($53) {
        $59 = $83.offset;
      } else {
        $59 = undefined;
      }
      return {
        line: $83.line,
        column: $83.column,
        offset: $59,
      };
    }
  }
  return $2;
}

function $0($1) {
  function $2($3) {
    const $83 = $3;
    let $7;
    let $10;
    let $16;
    let $23;
    let $28;
    let $34;
    let $53;
    let $59;
    if ($83) {
      const $84 = $3.position;
      $7 = $84;
    } else {
      $7 = $83;
    }
    if ($7) {
      const $85 = $3.position[$1];
      $10 = $85;
    } else {
      $10 = $7;
    }
    if ($10) {
      $16 = $10;
    } else {
      const $86 = {};
      $16 = $86;
    }
    const $87 = typeof $16.line === "number";
    if ($87) {
      const $88 = $16.line > 0;
      $23 = $88;
    } else {
      $23 = $87;
    }
    if ($23) {
      const $89 = typeof $16.column === "number";
      $28 = $89;
    } else {
      $28 = $23;
    }
    if ($28) {
      const $90 = $16.column > 0;
      $34 = $90;
    } else {
      $34 = $28;
    }
    if ($34) {
      const $91 = typeof $16.offset === "number";
      if ($91) {
        const $92 = $16.offset > -1;
        $53 = $92;
      } else {
        $53 = $91;
      }
      if ($53) {
        const $93 = $16.offset;
        $59 = $93;
      } else {
        $59 = undefined;
      }
      return {
        line: $16.line,
        column: $16.column,
        offset: $59,
      };
    }
  }
  return $2;
}

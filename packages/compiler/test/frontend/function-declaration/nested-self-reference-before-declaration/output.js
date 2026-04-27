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
      const $83 = $3.position;
      $7 = $83;
    } else {
      $7 = $82;
    }
    if ($7) {
      const $84 = $3.position[$1];
      $10 = $84;
    } else {
      $10 = $7;
    }
    const $85 = $10 ? $10 : {};
    const $86 = typeof $85.line === "number";
    if ($86) {
      const $87 = $85.line > 0;
      $23 = $87;
    } else {
      $23 = $86;
    }
    if ($23) {
      const $88 = typeof $85.column === "number";
      $28 = $88;
    } else {
      $28 = $23;
    }
    if ($28) {
      const $89 = $85.column > 0;
      $34 = $89;
    } else {
      $34 = $28;
    }
    if ($34) {
      const $90 = typeof $85.offset === "number";
      if ($90) {
        const $91 = $85.offset > -1;
        $53 = $91;
      } else {
        $53 = $90;
      }
      if ($53) {
        const $92 = $85.offset;
        $59 = $92;
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

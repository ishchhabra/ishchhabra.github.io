function $0($1) {
  function $2($3) {
    const $94 = $3;
    let $7;
    let $10;
    let $16;
    let $24;
    let $29;
    let $35;
    let $54;
    let $60;
    if ($94) {
      const $96 = $3.position;
      $7 = $96;
    } else {
      $7 = $94;
    }
    if ($7) {
      const $98 = $3.position[$1];
      $10 = $98;
    } else {
      $10 = $7;
    }
    if ($10) {
      $16 = $10;
    } else {
      const $100 = {};
      $16 = $100;
    }
    const $102 = typeof $16.line === "number";
    if ($102) {
      const $104 = $16.line > 0;
      $24 = $104;
    } else {
      $24 = $102;
    }
    if ($24) {
      const $106 = typeof $16.column === "number";
      $29 = $106;
    } else {
      $29 = $24;
    }
    if ($29) {
      const $108 = $16.column > 0;
      $35 = $108;
    } else {
      $35 = $29;
    }
    if ($35) {
      const $110 = typeof $16.offset === "number";
      if ($110) {
        const $112 = $16.offset > -1;
        $54 = $112;
      } else {
        $54 = $110;
      }
      if ($54) {
        const $114 = $16.offset;
        $60 = $114;
      } else {
        $60 = undefined;
      }
      return {
        line: $16.line,
        column: $16.column,
        offset: $60,
      };
    }
  }
  return $2;
}

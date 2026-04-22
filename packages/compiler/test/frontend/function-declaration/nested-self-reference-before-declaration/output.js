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
    if ($99) {
      const $101 = $3.position;
      $6 = $101;
    } else {
      $6 = $99;
    }
    if ($6) {
      const $103 = $3.position[$1];
      $9 = $103;
    } else {
      $9 = $6;
    }
    if ($9) {
      $15 = $9;
    } else {
      const $105 = {};
      $15 = $105;
    }
    const $107 = typeof $15.line === "number";
    if ($107) {
      const $109 = $15.line > 0;
      $23 = $109;
    } else {
      $23 = $107;
    }
    if ($23) {
      const $111 = typeof $15.column === "number";
      $28 = $111;
    } else {
      $28 = $23;
    }
    if ($28) {
      const $113 = $15.column > 0;
      $34 = $113;
    } else {
      $34 = $28;
    }
    if ($34) {
      const $115 = typeof $15.offset === "number";
      if ($115) {
        const $117 = $15.offset > -1;
        $53 = $117;
      } else {
        $53 = $115;
      }
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

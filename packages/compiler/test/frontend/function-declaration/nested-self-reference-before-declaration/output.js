function $0($1) {
  function $2($3) {
    const $99 = $3;
    let $8 = undefined;
    if ($99) {
      const $103 = $3.position;
      $8 = $103;
    } else {
      $8 = $99;
    }
    let $14 = undefined;
    if ($8) {
      const $105 = $3.position[$1];
      $14 = $105;
    } else {
      $14 = $8;
    }
    let $16 = undefined;
    if ($14) {
      $16 = $14;
    } else {
      const $107 = {};
      $16 = $107;
    }
    const $101 = typeof $16.line === "number";
    let $27 = undefined;
    if ($101) {
      const $109 = $16.line > 0;
      $27 = $109;
    } else {
      $27 = $101;
    }
    let $33 = undefined;
    if ($27) {
      const $111 = typeof $16.column === "number";
      $33 = $111;
    } else {
      $33 = $27;
    }
    let $38 = undefined;
    if ($33) {
      const $113 = $16.column > 0;
      $38 = $113;
    } else {
      $38 = $33;
    }
    if ($38) {
      const $115 = typeof $16.offset === "number";
      let $58 = undefined;
      if ($115) {
        const $117 = $16.offset > -1;
        $58 = $117;
      } else {
        $58 = $115;
      }
      let $62 = undefined;
      if ($58) {
        const $119 = $16.offset;
        $62 = $119;
      } else {
        $62 = undefined;
      }
      return {
        line: $16.line,
        column: $16.column,
        offset: $62,
      };
    }
  }
  return $2;
}

function $0($3) {
  function $4($5) {
    const $40 = $5;
    let $7;
    let $10;
    if ($40) {
      const $42 = $5.position;
      $7 = $42;
    } else {
      $7 = $40;
    }
    if ($7) {
      const $44 = $5.position[$3];
      $10 = $44;
    } else {
      $10 = $7;
    }
    return $10;
  }
  return $4;
}
export const pointEnd = $0("end");
export const pointStart = $0("start");

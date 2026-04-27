function $0($3) {
  function $4($5) {
    const $34 = $5;
    let $7;
    let $10;
    if ($34) {
      $7 = $5.position;
    } else {
      $7 = $34;
    }
    if ($7) {
      $10 = $5.position[$3];
    } else {
      $10 = $7;
    }
    return $10;
  }
  return $4;
}
export const pointEnd = $0("end");
export const pointStart = $0("start");

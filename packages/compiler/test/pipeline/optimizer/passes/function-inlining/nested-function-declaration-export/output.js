function $0($3) {
  function $4($5) {
    const $38 = $5;
    let $9 = undefined;
    if ($38) {
      const $40 = $5.position;
      $9 = $40;
    } else {
      $9 = $38;
    }
    let $15 = undefined;
    if ($9) {
      const $42 = $5.position[$3];
      $15 = $42;
    } else {
      $15 = $9;
    }
    return $15;
  }
  return $4;
}
const $1 = $0("end");
export { $1 as pointEnd };
const $2 = $0("start");
export { $2 as pointStart };

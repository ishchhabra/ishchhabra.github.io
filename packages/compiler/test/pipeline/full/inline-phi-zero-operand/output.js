function $0($1, $2, $3) {
  var $4 = undefined;
  var $7 = undefined;
  $4 = undefined;
  $7 = undefined;
  let $30 = undefined;
  let $45 = undefined;
  let $46 = undefined;
  if ($1) {
    let $20 = undefined;
    let $43 = undefined;
    let $44 = undefined;
    if ($2) {
      $4 = $2;
      $20 = $2;
      $43 = $4;
      $44 = $7;
    } else {
      $7 = $3;
      $20 = $3;
      $43 = $4;
      $44 = $7;
    }
    const $71 =
      ($20,
      {
        x: $43,
        y: $44,
      });
    $30 = $71;
    $45 = $43;
    $46 = $44;
  } else {
    const $73 = {};
    $30 = $73;
    $45 = $4;
    $46 = $7;
  }
  return $30;
}
console.log($0(globalThis.c, globalThis.a, globalThis.b));
